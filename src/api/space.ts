import { scrapeSpaceVideoList } from '../scraper.js'

export interface SpaceVideo {
  bvid: string
  title: string
  play: number
  videoReview: number
  video_review?: number
  comment?: number
  duration: number
  created: number
  pic: string
  length: string
  author: string
  mid: number
  aid?: number
}

export async function listAllVideos(uid: number): Promise<{ upName: string; videos: SpaceVideo[] }> {
  const { upName, videos } = await scrapeSpaceVideoList(uid)
  console.log(`  抓取到 ${videos.length} 个视频`)
  return { upName, videos }
}
