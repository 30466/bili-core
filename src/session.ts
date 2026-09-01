import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

export interface Session {
  sessdata: string
  buvid3: string
  biliJct: string
  cookie: string
}

let cachedSession: Session | null = null

export function getSession(): Session {
  if (cachedSession) return cachedSession

  const sessdata = process.env.BILIBILI_SESSDATA ?? ''
  const buvid3 = process.env.BILIBILI_BUVID3 ?? ''
  const biliJct = process.env.BILIBILI_BILI_JCT ?? ''
  const cookie = process.env.BILIBILI_COOKIE ?? ''

  if (!sessdata) {
    throw new Error(
      '未检测到 Bilibili 登录凭证。\n' +
      '请先运行: npm run get-cookie\n' +
      '或在 .env 文件中手动设置 BILIBILI_SESSDATA',
    )
  }

  cachedSession = {
    sessdata: decodeURIComponent(sessdata),
    buvid3: decodeURIComponent(buvid3),
    biliJct: decodeURIComponent(biliJct),
    cookie: cookie || `buvid3=${buvid3}; SESSDATA=${sessdata}; bili_jct=${biliJct}`,
  }
  return cachedSession
}

export function getCookieHeader(): string {
  const sessdata = process.env.BILIBILI_SESSDATA ?? ''
  if (!sessdata) return ''
  return getSession().cookie
}

export function clearSessionCache(): void {
  cachedSession = null
}
