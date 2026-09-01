import { apiGet } from './client.js'

export interface BiliUserResult {
  uname: string
  mid: number
  fans: number
}

/**
 * 按关键词搜索 B站 UP 主，返回匹配的用户列表
 * 无需登录，直调 B站搜索 API
 */
export async function searchUp主(keyword: string): Promise<BiliUserResult[]> {
  const data = await apiGet<{ result?: BiliUserResult[] }>(
    '/x/web-interface/wbi/search/type',
    {
      search_type: 'bili_user',
      keyword,
      page: 1,
    },
  )
  return data?.result ?? []
}

/**
 * 精确匹配 UP 主名称，返回 UID；无精确匹配时返回 null
 */
export async function lookupUp主(keyword: string): Promise<number | null> {
  const users = await searchUp主(keyword)
  const exact = users.find(u => u.uname === keyword)
  return exact ? exact.mid : null
}
