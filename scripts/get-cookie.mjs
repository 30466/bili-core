import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const envPath = path.resolve(process.cwd(), '.env')

async function main() {
  console.log('正在启动浏览器...')
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('https://www.bilibili.com/')
  console.log('请在打开的浏览器中扫码登录 Bilibili。')
  console.log('等待登录中...')

  let loggedIn = false
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(1000)
    if (page.isClosed()) {
      break
    }
    const cookies = await context.cookies()
    const hasSession = cookies.some(c => c.name === 'SESSDATA' && c.value)
    if (hasSession) {
      loggedIn = true
      break
    }
    if (i % 10 === 9) process.stdout.write('.')
  }

  if (!loggedIn) {
    console.log('\n超时未检测到登录。')
    await browser.close()
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

  await browser.close()

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

  writeFileSync(envPath, content)
  console.log('\nCookie 已安全保存到 .env')
}

main().catch(err => {
  console.error('失败:', err.message)
  process.exit(1)
})
