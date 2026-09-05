import { chromium } from 'playwright'
import type { SpaceVideo } from './api/space.js'
import { getSession } from './session.js'

const MAX_RETRIES = 3

async function scrapeCore(uid: number): Promise<{ upName: string; videos: SpaceVideo[] }> {
  const browser = await chromium.launch({ headless: true })
  try {
    const session = getSession()
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    })

    await ctx.addCookies([
      { name: 'SESSDATA', value: session.sessdata, domain: '.bilibili.com', path: '/' },
      { name: 'buvid3', value: session.buvid3, domain: '.bilibili.com', path: '/' },
      { name: 'bili_jct', value: session.biliJct, domain: '.bilibili.com', path: '/' },
    ])

    const page = await ctx.newPage()

    // validate cookie first
    const navResp = await page.request.get('https://api.bilibili.com/x/web-interface/nav')
    const navBody = await navResp.json() as { code: number; data?: { uname?: string } }
    if (navBody.code !== 0) throw new Error(`Cookie 失效 (code=${navBody.code}), 请重新运行 npm run get-cookie`)

    page.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,eot,mp4,webm}', route => route.abort())
    page.route('**/log/**', route => route.abort())

    const allVideos: SpaceVideo[] = []
    let pendingPn = 0
    let totalCount = 0

    page.on('response', async (resp) => {
      const url = resp.url()
      if (!url.includes('/x/space/wbi/arc/search') || resp.status() !== 200) return
      try {
        const json = await resp.json() as { code: number; data?: { list: { vlist: SpaceVideo[] }; page: { pn: number; ps: number; count: number } } }
        if (json.code !== 0 || !json.data) return
        const pn = json.data.page?.pn
        if (pn === pendingPn) {
          allVideos.push(...json.data.list.vlist)
          if (pn === 1) totalCount = json.data.page.count
          pendingPn = 0
        }
      } catch {}
    })

    await page.goto(`https://space.bilibili.com/${uid}/upload/video`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    pendingPn = 1
    for (let w = 0; w < 30; w++) {
      await page.waitForTimeout(500)
      if (pendingPn === 0) break
    }
    if (pendingPn !== 0) throw new Error('获取第一页失败')

    // 从页面 DOM 直接取 UP 主昵称，不受联合投稿干扰
    const upName = (await page.locator('.nickname').first().textContent({ timeout: 5000 }))?.trim() || String(uid)

    const perPage = allVideos.length
    const totalPages = Math.ceil(totalCount / perPage)
    process.stderr.write(`  共 ${totalPages} 页 (每页 ${perPage} 个, 共 ${totalCount} 个视频)\n`)

    for (let pn = 2; pn <= totalPages; pn++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(500)

      const nextBtn = page.getByRole('button', { name: '下一页' })
      const visible = await nextBtn.isVisible().catch(() => false)
      if (!visible) {
        process.stderr.write(`  按钮不可见(第${pn}页), 当前共${allVideos.length}个\n`)
        break
      }
      await nextBtn.click()

      pendingPn = pn
      for (let w = 0; w < 10; w++) {
        await page.waitForTimeout(500)
        if (pendingPn === 0) break
      }
      if (pendingPn !== 0) {
        process.stderr.write(`  第${pn}页超时, 当前共${allVideos.length}个\n`)
        break
      }
      // Page scraping can run concurrently for several UP creators during
      // `sync`; use complete lines so their output cannot leave stale suffixes.
      process.stderr.write(`  第 ${pn}/${totalPages} 页 (${allVideos.length}/${totalCount})\n`)
    }

    process.stderr.write(`  完成: ${allVideos.length} 个视频\n`)
    return { upName, videos: allVideos }
  } finally {
    await browser.close()
  }
}

export async function scrapeSpaceVideoList(uid: number): Promise<{ upName: string; videos: SpaceVideo[] }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await scrapeCore(uid)
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err
      process.stderr.write(`  ✗ 第${attempt}次失败 (${(err as Error).message}), 重试第${attempt + 1}次...\n`)
    }
  }
  throw new Error('重试用尽')
}
