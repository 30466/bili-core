import { chromium } from 'playwright'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { checkLogin, clearLoginCache } from './api/client.js'
import { clearSessionCache } from './session.js'

const envPath = path.resolve(process.cwd(), '.env')

export async function ensureLogin(): Promise<void> {
  // Check if we already have valid session
  const sessdata = process.env.BILIBILI_SESSDATA ?? ''
  if (sessdata) {
    try {
      const valid = await checkLogin()
      if (valid) return
      // Cookie 过期，需要重新登录
      console.log('Cookie 已过期，正在重新登录...')
      process.env.BILIBILI_SESSDATA = ''
      process.env.BILIBILI_BUVID3 = ''
      process.env.BILIBILI_BILI_JCT = ''
      process.env.BILIBILI_COOKIE = ''
      clearSessionCache()
      clearLoginCache()
    } catch {
      // checkLogin failed (network error etc), still try to proceed
      return
    }
  }

  await doBrowserLogin()
}

async function doBrowserLogin(): Promise<void> {
  console.log('未检测到登录凭证，正在打开浏览器...')
  const browser = await chromium.launch({ headless: false })
  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('https://www.bilibili.com/')
    console.log('请在浏览器中扫码登录 Bilibili')
    console.log('等待登录中...')

    let loggedIn = false
    for (let i = 0; i < 180; i++) {
      await page.waitForTimeout(1000)
      if (page.isClosed()) break
      const cookies = await context.cookies()
      if (cookies.some(c => c.name === 'SESSDATA' && c.value)) {
        loggedIn = true
        break
      }
      if (i % 10 === 9) process.stdout.write('.')
    }

    if (!loggedIn) {
      console.log('\n超时未检测到登录')
      process.exit(1)
    }

    const cookies = await context.cookies()
    let sessdata = '', buvid3 = '', biliJct = ''
    const allCookies = cookies.map(c => `${c.name}=${c.value}`)

    for (const c of cookies) {
      if (c.name === 'SESSDATA') sessdata = c.value
      if (c.name === 'buvid3') buvid3 = c.value
      if (c.name === 'bili_jct') biliJct = c.value
    }

    if (!sessdata) {
      console.error('\n错误: 未找到 SESSDATA')
      process.exit(1)
    }

    const content = [
      '# Bilibili login credentials',
      `BILIBILI_SESSDATA=${sessdata}`,
      `BILIBILI_BUVID3=${buvid3}`,
      `BILIBILI_BILI_JCT=${biliJct}`,
      `BILIBILI_COOKIE=${allCookies.join('; ')}`,
      '',
    ].join('\n')

    await fsp.writeFile(envPath, content)
    console.log('\n登录成功 ✓')

    // Reload env vars
    process.env.BILIBILI_SESSDATA = sessdata
    process.env.BILIBILI_BUVID3 = buvid3
    process.env.BILIBILI_BILI_JCT = biliJct
    process.env.BILIBILI_COOKIE = allCookies.join('; ')
  } finally {
    await browser.close()
  }
}
