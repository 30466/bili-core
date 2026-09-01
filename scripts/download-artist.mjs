import dotenv from 'dotenv'
import path from 'node:path'
import fsp from 'node:fs/promises'
import fs from 'node:fs'
import { apiGet, checkLogin } from '../dist/api/client.js'
import { pickBestAudio, getAudioExt } from '../dist/api/playurl.js'
import { downloadFile } from '../dist/downloader.js'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const dataArgIndex = args.indexOf('--data')
const DATA_FILE = path.resolve(process.cwd(), dataArgIndex >= 0 ? args[dataArgIndex + 1] : 'data/creator.json')
const DOWNLOAD_DIR = path.resolve(process.cwd(), 'downloads')

const args = process.argv.slice(2)
const keyword = args.includes('--keyword') ? args[args.indexOf('--keyword') + 1] : '关键词'
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity
const concurrency = args.includes('--concurrency') ? parseInt(args[args.indexOf('--concurrency') + 1], 10) : 5
const delay = args.includes('--delay') ? parseInt(args[args.indexOf('--delay') + 1], 10) : 200
const skipExisting = !args.includes('--force')

function sanitize(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '_')
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const loggedIn = await checkLogin()
  if (!loggedIn) {
    console.error('Cookie 已过期，请重新运行: npm run get-cookie')
    process.exit(1)
  }

  const raw = await fsp.readFile(DATA_FILE, 'utf-8')
  const data = JSON.parse(raw)
  const videos = Object.values(data.videos)

  const filtered = videos.filter(v => v.title.includes(keyword))
  console.log(`找到 ${filtered.length} 个匹配 "${keyword}" 的视频 (共 ${videos.length} 个)`)

  const toDownload = filtered.slice(0, limit)
  if (limit < Infinity) console.log(`--limit ${limit}，实际下载 ${toDownload.length} 个`)

  const ownerDir = path.join(DOWNLOAD_DIR, sanitize(data.upName))
  await fsp.mkdir(ownerDir, { recursive: true })

  let completed = 0
  let succeeded = 0
  let failed = 0
  let skipped = 0

  async function downloadOne(video) {
    const title = sanitize(video.title)

    const loggedIn = await checkLogin()
    if (!loggedIn) {
      console.error('\nCookie 已过期，请重新运行: npm run get-cookie')
      process.exit(1)
    }

    try {
      const playurl = await apiGet('/x/player/wbi/playurl', {
        bvid: video.bvid,
        cid: video.cid,
        fnval: 4048,
        fourk: 1,
      })
      const stream = pickBestAudio(playurl.dash)
      if (!stream) {
        console.log(`  [${completed + 1}/${toDownload.length}] ${video.title} -> 无音频流，跳过`)
        completed++
        failed++
        return
      }
      const ext = getAudioExt(stream)
      const filePath = path.join(ownerDir, `${title}${ext}`)

      if (skipExisting && fs.existsSync(filePath)) {
        completed++
        skipped++
        return
      }

      await downloadFile(stream.baseUrl, filePath)
      completed++
      succeeded++
      console.log(`  [${completed}/${toDownload.length}] ${video.title}${ext} ✓`)
    } catch (err) {
      completed++
      failed++
      console.log(`  [${completed}/${toDownload.length}] ${video.title} -> 失败: ${err.message}`)
    }
  }

  for (let i = 0; i < toDownload.length; i += concurrency) {
    const chunk = toDownload.slice(i, i + concurrency)
    await Promise.all(chunk.map(downloadOne))
    if (i + concurrency < toDownload.length) {
      await sleep(delay)
    }
  }

  console.log(`\n完成: ${succeeded} 成功, ${skipped} 跳过, ${failed} 失败`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
