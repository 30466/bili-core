import crypto from 'node:crypto'

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 37, 12, 52, 4, 48,
  62, 41, 7, 56, 16, 40, 60, 30, 51, 6, 44, 1, 57, 54, 17, 34,
  39, 24, 61, 36, 13, 55, 0, 63, 59, 38, 11, 22, 26, 25, 20, 21,
]

function getMixinKey(key: string): string {
  return mixinKeyEncTab.map(i => key[i]).join('').slice(0, 32)
}

export function encWbi(
  params: Record<string, string | number>,
  imgKey: string,
  subKey: string,
): { w_rid: string; wts: number } {
  const mixinKey = getMixinKey(imgKey + subKey)
  const currTime = Math.round(Date.now() / 1000)
  const signParams: Record<string, string> = { ...Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ), wts: String(currTime) }
  const keys = Object.keys(signParams).sort()
  const query = keys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(signParams[k])}`)
    .join('&')
  const wbiSign = crypto.createHash('md5').update(query + mixinKey).digest('hex')
  return { w_rid: wbiSign, wts: currTime }
}

export function getKeyFromUrl(url: string): string {
  const name = url.split('/').pop() ?? ''
  return name.split('.')[0]
}
