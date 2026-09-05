#!/usr/bin/env node

import { Command } from 'commander'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { listAllVideos } from './api/space.js'
import { getVideoInfo, getPlayUrl, pickBestAudio, pickBestVideo, getAudioExt, getVideoExt } from './api/playurl.js'
import { checkLogin, clearLoginCache } from './api/client.js'
import { searchUp主, lookupUp主 } from './api/search.js'
import { downloadFile, ensureFfmpeg, mergeStreams } from './downloader.js'
import { exportUp, generateCsv } from './export.js'
import { ensureLogin } from './login.js'
import { clearSessionCache } from './session.js'
import { formatBeijingDateFromUnixSeconds } from './time.js'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

async function resolveUid(uidArg: string | undefined, nameOpt: string | undefined): Promise<number> {
  if (nameOpt) {
    const uid = await lookupUp主(nameOpt)
    if (uid === null) {
      const users = await searchUp主(nameOpt)
      if (users.length === 0) throw new Error(`未找到名为 "${nameOpt}" 的 UP 主`)
      for (const u of users.slice(0, 10)) {
        console.error(`  ${u.uname}  UID: ${u.mid}  粉丝: ${u.fans.toLocaleString()}`)
      }
      throw new Error(`未找到名为 "${nameOpt}" 的 UP 主，请从候选列表中选择正确的 UID`)
    }
    return uid
  }
  if (uidArg) {
    const uidNum = parseInt(uidArg, 10)
    if (isNaN(uidNum)) throw new Error('UID 必须是数字')
    return uidNum
  }
  throw new Error('请提供 UID 参数或 --name 选项')
}

async function cmdList(uid: string | undefined, options: { json?: boolean; limit?: string; name?: string }) {
  await ensureLogin()
  const uidNum = await resolveUid(uid, options.name)

  const limit = options.limit ? parseInt(options.limit, 10) : 30
  const { videos } = await listAllVideos(uidNum)
  const sliced = videos.slice(0, limit)

  if (options.json) {
    console.log(JSON.stringify(sliced, null, 2))
    return
  }

  console.log(`共 ${videos.length} 个视频 (显示前 ${sliced.length} 个):\n`)
  for (const v of sliced) {
    const date = formatBeijingDateFromUnixSeconds(v.created) || '未知'
    console.log(`  ${v.bvid}  ${v.title}`)
    console.log(`    播放: ${v.play}  时长: ${v.length}  日期: ${date}（北京时间）\n`)
  }
}

async function cmdInfo(bvid: string, options: { json?: boolean }) {
  await ensureLogin()
  const info = await getVideoInfo(bvid)
  const playurl = await getPlayUrl(bvid, info.cid, true)

  const result: Record<string, unknown> = { ...info, playurl }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log(`\n标题: ${info.title}`)
  console.log(`UP主: ${info.ownerName} (${info.ownerMid})`)
  console.log(`时长: ${formatDuration(info.duration)}`)
  console.log(`分P: ${info.pages.length}`)

  const dash = playurl.dash
  console.log(`\n可用视频流: ${dash.video.length} 个`)
  for (const v of dash.video) {
    console.log(`  [${v.id}] ${v.width}x${v.height} ${v.codecs} ${(v.bandwidth / 1000).toFixed(0)}kbps`)
  }

  console.log(`\n可用音频流: ${dash.audio?.length ?? 0} 个`)
  for (const a of dash.audio ?? []) {
    const label = a.mimeType.includes('flac') ? 'FLAC' : 'AAC'
    console.log(`  [${a.id}] ${label} ${(a.bandwidth / 1000).toFixed(0)}kbps`)
  }

  if (dash.flac?.audio) {
    console.log(`\n  Hi-Res FLAC: 可用 ✓`)
  }
  if (dash.dolby?.audio) {
    console.log(`  Dolby Atmos: 可用 ✓`)
  }
}

async function cmdDownload(
  bvid: string,
  options: { audio?: boolean; page?: string; json?: boolean },
) {
  await ensureLogin()
  const info = await getVideoInfo(bvid)

  const pageIdx = options.page ? parseInt(options.page, 10) - 1 : 0
  const targetPage = info.pages[pageIdx]
  if (!targetPage) throw new Error(`不存在第 ${pageIdx + 1} P`)

  const cid = targetPage.cid
  const playurl = await getPlayUrl(bvid, cid, true)
  const dash = playurl.dash

  const audioStream = pickBestAudio(dash)
  if (!audioStream) throw new Error('未找到可用的音频流')

  const isHiRes = getAudioExt(audioStream) === '.flac' || !!dash.dolby?.audio
  const audioExt = getAudioExt(audioStream)

  const sanitizedTitle = info.title.replace(/[/\\?%*:|"<>]/g, '_')
  const pageLabel = info.pages.length > 1 ? `_P${pageIdx + 1}` : ''
  const outDir = path.join(process.cwd(), 'downloads', info.ownerName)

  await fsp.mkdir(outDir, { recursive: true })

  if (options.audio) {
    const audioPath = path.join(outDir, `${sanitizedTitle}${pageLabel}${audioExt}`)
    console.log(`\n下载音频: ${audioStream.baseUrl}`)
    await downloadFile(audioStream.baseUrl, audioPath, p => {
      if (p.percent !== null) {
        process.stdout.write(`\r  进度: ${p.percent}%`)
      }
    })
    process.stdout.write('\n')
    console.log(`已保存: ${audioPath}`)
    if (options.json) {
      console.log(JSON.stringify({ path: audioPath, format: audioExt, hiRes: isHiRes }))
    }
    return
  }

  const videoStream = pickBestVideo(dash)
  if (!videoStream) throw new Error('未找到可用的视频流')

  const baseName = `${sanitizedTitle}${pageLabel}`
  const videoExt = getVideoExt(videoStream)
  const videoPath = path.join(outDir, `${baseName}_video${videoExt}`)
  const audioPath = path.join(outDir, `${baseName}${audioExt}`)

  console.log(`\n下载视频流 (${videoStream.width}x${videoStream.height})...`)
  await downloadFile(videoStream.baseUrl, videoPath, p => {
    if (p.percent !== null) process.stdout.write(`\r  视频: ${p.percent}%`)
  })
  process.stdout.write('\n')

  const audioLabel = audioExt === '.flac' ? 'FLAC' : audioExt === '.eac3' ? 'Dolby' : 'AAC'
  console.log(`下载音频流 (${audioLabel})...`)
  await downloadFile(audioStream.baseUrl, audioPath, p => {
    if (p.percent !== null) process.stdout.write(`\r  音频: ${p.percent}%`)
  })
  process.stdout.write('\n')

  const hasFfmpeg = await ensureFfmpeg()
  if (hasFfmpeg) {
    console.log('正在用 ffmpeg 无损合并...')
    await mergeStreams(videoPath, audioPath, path.join(outDir, baseName))
    console.log(`已保存: ${path.join(outDir, baseName)}*`)
    await fsp.unlink(videoPath).catch(() => {})
    await fsp.unlink(audioPath).catch(() => {})
  } else {
    console.log('ffmpeg 未安装，原始文件已保留:')
    console.log(`  视频: ${videoPath}`)
    console.log(`  音频: ${audioPath}`)
  }

  if (options.json) {
    console.log(JSON.stringify({ outputDir: outDir, hiRes: isHiRes }))
  }
}

async function cmdBatch(
  uid: string | undefined,
  options: { audio?: boolean; limit?: string; name?: string },
) {
  await ensureLogin()
  const uidNum = await resolveUid(uid, options.name)

  const limit = options.limit ? parseInt(options.limit, 10) : 10
  const { videos } = await listAllVideos(uidNum)
  const sliced = videos.slice(0, limit)

  console.log(`准备下载 ${sliced.length} 个视频...\n`)

  for (let i = 0; i < sliced.length; i++) {
    const v = sliced[i]
    console.log(`[${i + 1}/${sliced.length}] ${v.title}`)
    try {
      await cmdDownload(v.bvid, { ...options, json: false })
      console.log('')
    } catch (err) {
      const msg = (err as Error).message
      console.error(`  下载失败: ${msg}`)
      // If auth error, trigger re-login and retry once
      if (msg.includes('-101') || msg.includes('登录') || msg.includes('cookie') || msg.includes('Cookie')) {
        console.log('  检测到认证问题，正在重新登录...')
        process.env.BILIBILI_SESSDATA = ''
        process.env.BILIBILI_BUVID3 = ''
        process.env.BILIBILI_COOKIE = ''
        clearSessionCache()
        clearLoginCache()
        await ensureLogin()
        console.log('  重试中...')
        try {
          await cmdDownload(v.bvid, { ...options, json: false })
          console.log('')
          continue
        } catch (err2) {
          console.error(`  重试失败: ${(err2 as Error).message}\n`)
        }
      }
      console.log('')
    }
  }

  console.log('批量下载完成')
}

async function cmdExport(uid: string | undefined, options: { concurrency?: string; delay?: string; name?: string }) {
  await ensureLogin()
  const uidNum = await resolveUid(uid, options.name)

  const concurrency = options.concurrency ? parseInt(options.concurrency, 10) : 20
  const delayMs = options.delay ? parseInt(options.delay, 10) : 50

  const result = await exportUp({
    uid: uidNum,
    concurrency,
    delayMs,
    onProgress: (current, total, bvid, title) => {
      process.stdout.write(`\r  进度: ${current}/${total}  ${bvid}  ${title?.slice(0, 30) ?? ''}`)
    },
    onFailure: (bvid, title) => {
      console.error(`\n  详情抓取失败: ${bvid}  ${title}`)
    },
  })
  process.stdout.write('\n')

  const csvPath = path.join(path.resolve('data'), result.upName, `${uidNum}.csv`)
  const csv = generateCsv(result.videos)
  await fsp.mkdir(path.dirname(csvPath), { recursive: true })
  await fsp.writeFile(csvPath, csv)
  console.log(`CSV 已保存: ${csvPath}`)
  console.log('导出完成')
}

function cmdCookie() {
  console.log('运行 npm run get-cookie 可通过浏览器自动获取 Cookie（推荐）')
  console.log('要求: 首次使用需安装 Playwright 浏览器: npx playwright install chromium')
}

async function cmdSync(
  file: string,
  options: { concurrency?: string; delay?: string; concurrencyUp?: string },
) {
  await ensureLogin()

  const content = await fsp.readFile(file, 'utf-8')
  const names = [...new Set(
    content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')),
  )]
  console.log(`白名单共 ${names.length} 个 UP 主 (去重后)\n`)

  const concurrency = options.concurrency ? parseInt(options.concurrency, 10) : 20
  const delayMs = options.delay ? parseInt(options.delay, 10) : 50
  const concurrencyUp = options.concurrencyUp ? parseInt(options.concurrencyUp, 10) : 3

  const valid: { name: string; uid: number }[] = []
  const failedNames: string[] = []
  for (const name of names) {
    try {
      const uid = await lookupUp主(name)
      if (uid) {
        valid.push({ name, uid })
        console.log(`  ✓ ${name} → UID ${uid}`)
      } else {
        failedNames.push(name)
        console.warn(`  ✗ ${name} → 未找到，跳过`)
      }
    } catch (err) {
      failedNames.push(name)
      console.warn(`  ✗ ${name} → 查找失败: ${(err as Error).message}`)
    }
  }

  const skipped = names.length - valid.length
  console.log(`\n有效 UP 主: ${valid.length} 个，跳过: ${skipped} 个\n`)

  if (valid.length === 0) {
    console.error('没有可同步的 UP 主')
    return
  }

  let success = 0
  let failed = 0

  async function processOne(entry: { name: string; uid: number }, idx: number) {
    const label = `[${idx + 1}/${valid.length}] ${entry.name}`
    try {
      const result = await exportUp({
        uid: entry.uid,
        concurrency,
        delayMs,
        onProgress: (cur, total, bvid, title) => {
          // Several UP creators are exported concurrently. Emit occasional
          // complete lines instead of competing carriage-return progress bars.
          if (cur === total || cur % 50 === 0) {
            console.log(`  ${label}  进度: ${cur}/${total}  ${bvid}  ${title?.slice(0, 30) ?? ''}`)
          }
        },
        onFailure: (bvid, title) => {
          console.error(`  ${label} 详情抓取失败: ${bvid}  ${title}`)
        },
      })

      const csvPath = path.join(path.resolve('data'), result.upName, `${entry.uid}.csv`)
      const csv = generateCsv(result.videos)
      await fsp.mkdir(path.dirname(csvPath), { recursive: true })
      await fsp.writeFile(csvPath, csv)

      const count = Object.keys(result.videos).length
      console.log(`  ${label} ✓ (${count} 个视频)\n`)
      success++
    } catch (err) {
      console.error(`  ${label} ✗ 失败: ${(err as Error).message}\n`)
      failedNames.push(entry.name)
      failed++
    }
  }

  let nextIdx = concurrencyUp
  const workers: Promise<void>[] = []

  async function worker() {
    while (true) {
      const idx = nextIdx++
      if (idx >= valid.length) break
      await processOne(valid[idx], idx)
    }
  }

  for (let i = 0; i < Math.min(concurrencyUp, valid.length); i++) {
    workers.push((async () => {
      await processOne(valid[i], i)
      await worker()
    })())
  }

  await Promise.all(workers)

  console.log(`同步完成！成功 ${success} 个 | 跳过 ${skipped} 个 | 失败 ${failed} 个`)
  if (failedNames.length > 0) {
    console.log(`失败的 UP 主: ${failedNames.join('、')}`)
  }
}

async function cmdLookup(keyword: string) {
  const uid = await lookupUp主(keyword)
  if (uid) {
    console.log(String(uid))
    return
  }

  // 无精确匹配，列候选
  const users = await searchUp主(keyword)

  if (users.length === 0) {
    console.error(`未找到 "${keyword}" 对应的 UP 主`)
    return
  }

  for (const user of users.slice(0, 10)) {
    console.log(`  ${user.uname}  UID: ${user.mid}  粉丝: ${user.fans.toLocaleString()}`)
  }
}

const program = new Command()

program
  .name('bili')
  .description('Bilibili UP 主视频抓取、元数据导出与音视频下载工具')
  .version('0.1.0')

program
  .command('list')
  .description('列出 UP 主的所有视频')
  .argument('[uid]', 'UP 主的 UID')
  .option('--name <name>', '按 UP 主名称查找（替代 uid 参数）')
  .option('--json', 'JSON 格式打印到终端')
  .option('--limit <N>', '限制数量', '30')
  .action(cmdList)

program
  .command('info')
  .description('查看视频信息和可用流')
  .argument('<bvid>', '视频 BVID')
  .option('--json', 'JSON 格式输出')
  .action(cmdInfo)

program
  .command('download')
  .description('下载视频')
  .argument('<bvid>', '视频 BVID')
  .option('--audio', '仅下载音频')
  .option('--page <N>', '指定分P', '1')
  .option('--json', 'JSON 格式输出')
  .action(cmdDownload)

program
  .command('batch')
  .description('批量下载 UP 主的视频')
  .argument('[uid]', 'UP 主的 UID')
  .option('--name <name>', '按 UP 主名称查找（替代 uid 参数）')
  .option('--audio', '仅下载音频')
  .option('--limit <N>', '限制下载数量', '10')
  .action(cmdBatch)

async function cmdCheckLogin() {
  const ok = await checkLogin()
  if (ok) {
    console.log('Cookie 有效 ✓')
    process.exit(0)
  } else {
    console.log('Cookie 已过期，请运行: npm run get-cookie')
    process.exit(1)
  }
}

program
  .command('check-login')
  .description('检查登录状态')
  .action(cmdCheckLogin)

program
  .command('cookie')
  .description('从浏览器 Cookie 中获取登录凭证')
  .action(cmdCookie)

program
  .command('export')
  .description('导出 UP 主所有视频元数据到 JSON + CSV')
  .argument('[uid]', 'UP 主的 UID')
  .option('--name <name>', '按 UP 主名称查找（替代 uid 参数）')
  .option('--concurrency <N>', '并发数', '20')
  .option('--delay <N>', '每批间隔毫秒', '50')
  .action(cmdExport)

program
  .command('lookup')
  .description('按名称精确匹配 UP 主，输出 UID')
  .argument('<keyword>', 'UP 主名称关键词')
  .action(cmdLookup)

program
  .command('sync')
  .description('根据白名单批量同步 UP 主视频数据')
  .argument('<file>', '白名单文件路径（每行一个 UP 主名称，# 开头为注释）')
  .option('--concurrency <N>', '每个 UP 主内部并发数', '20')
  .option('--delay <N>', '每批间隔毫秒', '50')
  .option('--concurrency-up <N>', '同时处理的 UP 主数量', '3')
  .action(cmdSync)

program.parse(process.argv)
