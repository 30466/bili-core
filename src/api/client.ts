import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { encWbi, getKeyFromUrl } from '../wbi.js'
import { getCookieHeader } from '../session.js'

export interface WbiKeys {
  imgKey: string
  subKey: string
}

let cachedWbiKeys: WbiKeys | null = null
let keysFetchedAt = 0
let wbiKeysPromise: Promise<WbiKeys> | null = null

const WBI_KEY_TTL = 600_000

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      const isNetworkError =
        err?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT' ||
        err?.message?.includes('ECONNRESET') ||
        err?.message?.includes('socket')
      if (isNetworkError && i < retries - 1) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

function createClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: 'https://api.bilibili.com',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.bilibili.com/',
    },
    timeout: 30_000,
  })

  instance.interceptors.request.use(config => {
    config.headers.Cookie = getCookieHeader()
    return config
  })

  return instance
}

export const client = createClient()

let cachedLoginCheck = { isLogin: false, checkedAt: 0 }
let loginPromise: Promise<boolean> | null = null
const LOGIN_CHECK_TTL = 60_000

export function clearLoginCache(): void {
  cachedLoginCheck = { isLogin: false, checkedAt: 0 }
  loginPromise = null
}

export async function checkLogin(): Promise<boolean> {
  const now = Date.now()
  if (now - cachedLoginCheck.checkedAt < LOGIN_CHECK_TTL) {
    return cachedLoginCheck.isLogin
  }

  if (loginPromise) {
    return loginPromise
  }

  loginPromise = (async () => {
    try {
      const res = await fetchWithRetry(() => client.get('/x/web-interface/nav'))
      const data = res.data as Record<string, unknown>
      const navData = data.data as Record<string, unknown> | undefined
      const isLogin = navData?.isLogin === true
      cachedLoginCheck = { isLogin, checkedAt: Date.now() }
      return isLogin
    } finally {
      loginPromise = null
    }
  })()

  return loginPromise
}

export async function fetchWbiKeys(): Promise<WbiKeys> {
  const now = Date.now()
  if (cachedWbiKeys && now - keysFetchedAt < WBI_KEY_TTL) {
    return cachedWbiKeys
  }

  if (wbiKeysPromise) {
    return wbiKeysPromise
  }

  wbiKeysPromise = (async () => {
    try {
      const res = await fetchWithRetry(() => client.get('/x/web-interface/nav'))
      const data = res.data as Record<string, unknown>
      const navData = data.data as Record<string, unknown> | undefined
      const wbiImg = (navData?.wbi_img as Record<string, unknown>) ?? {}
      const imgUrl = wbiImg.img_url as string
      const subUrl = wbiImg.sub_url as string

      if (!imgUrl || !subUrl) {
        throw new Error('获取 WBI 密钥失败，请检查登录状态')
      }

      cachedWbiKeys = {
        imgKey: getKeyFromUrl(imgUrl),
        subKey: getKeyFromUrl(subUrl),
      }
      keysFetchedAt = Date.now()
      return cachedWbiKeys
    } finally {
      wbiKeysPromise = null
    }
  })()

  return wbiKeysPromise
}

export async function apiGet<T = unknown>(
  path: string,
  params: Record<string, string | number> = {},
  config?: AxiosRequestConfig,
): Promise<T> {
  const keys = await fetchWbiKeys()
  const signed = encWbi(params, keys.imgKey, keys.subKey)
  const allParams = { ...params, w_rid: signed.w_rid, wts: signed.wts }

  const res = await client.get(path, {
    ...config,
    params: allParams,
    paramsSerializer: { indexes: null },
  })

  const body = res.data as { code: number; message: string; data?: unknown }
  if (body.code !== 0) {
    throw new Error(`API 错误 [${path}]: ${body.message}`)
  }
  return body.data as T
}

export async function apiGetNoSign<T = unknown>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const res = await client.get(path, { params })
  const body = res.data as { code: number; message: string; data?: unknown }
  if (body.code !== 0) {
    throw new Error(`API 错误 [${path}]: ${body.message}`)
  }
  return body.data as T
}
