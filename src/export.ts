import fsp from 'node:fs/promises'
import path from 'node:path'
import { client } from './api/client.js'
import { listAllVideos } from './api/space.js'

export interface VideoStat {
  view: number
  like: number
  coin: number
  favorite: number
  share: number
  danmaku: number
  reply: number
}

export interface PageInfo {
  cid: number
  part: string
}

/** A single video inside a Bilibili collection (合集/UGC season). */
export interface CollectionEpisode {
  bvid: string
  aid: number
  cid: number
  title: string
  cover: string
  duration: number
  created: number
}

export interface CollectionSection {
  title: string
  episodes: CollectionEpisode[]
}

export interface CollectionInfo {
  id: number
  title: string
  cover: string
  intro: string
  episodeCount: number
  sections: CollectionSection[]
}

export interface CollectionRef {
  id: number
  title: string
  index: number
  total: number
}

export interface VideoEntry {
  bvid: string
  aid: number
  title: string
  cover: string
  description: string
  duration: number
  created: number
  tid: number
  tname: string
  stat: VideoStat
  cid: number
  pages: PageInfo[]
  /** Present when this video belongs to a Bilibili collection. */
  collection?: CollectionRef
}

export interface UpData {
  upName: string
  uid: number
  updatedAt: string
  videos: Record<string, VideoEntry>
  /** Collections discovered while fetching the individual video details. */
  collections: Record<string, CollectionInfo>
}

const DATA_DIR = path.resolve(process.cwd(), 'data')

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { recursive: true })
}

function upDir(upName: string) {
  return path.join(DATA_DIR, upName)
}

function dataPath(upName: string, uid: number) {
  return path.join(upDir(upName), `${uid}.json`)
}

interface FetchResult {
  entry: VideoEntry
  collection: CollectionInfo | null
}

function parseCollection(raw: any): CollectionInfo | null {
  const id = Number(raw?.id)
  if (!raw || !Number.isFinite(id) || id <= 0) return null

  const sections: CollectionSection[] = (Array.isArray(raw.sections) ? raw.sections : [])
    .map((section: any) => ({
      title: String(section?.title ?? ''),
      episodes: (Array.isArray(section?.episodes) ? section.episodes : [])
        .map((episode: any): CollectionEpisode | null => {
          const bvid = String(episode?.bvid ?? '')
          if (!bvid) return null
          const arc = episode?.arc ?? {}
          const page = episode?.page ?? episode?.pages?.[0] ?? {}
          return {
            bvid,
            aid: Number(episode?.aid ?? arc?.aid ?? 0),
            cid: Number(episode?.cid ?? page?.cid ?? 0),
            title: String(episode?.title ?? arc?.title ?? ''),
            cover: String(arc?.pic ?? ''),
            duration: Number(arc?.duration ?? page?.duration ?? 0),
            created: Number(arc?.pubdate ?? 0),
          }
        })
        .filter((episode: CollectionEpisode | null): episode is CollectionEpisode => Boolean(episode)),
    }))
    .filter((section: CollectionSection) => section.episodes.length > 0)

  const episodeCount = Number(raw.ep_count ?? sections.reduce((count, section) => count + section.episodes.length, 0))
  return {
    id,
    title: String(raw.title ?? ''),
    cover: String(raw.cover ?? ''),
    intro: String(raw.intro ?? ''),
    episodeCount,
    sections,
  }
}

function collectionRefFor(collection: CollectionInfo | null, bvid: string): CollectionRef | undefined {
  if (!collection) return undefined
  const episodes = collection.sections.flatMap(section => section.episodes)
  const index = episodes.findIndex(episode => episode.bvid === bvid)
  return {
    id: collection.id,
    title: collection.title,
    index: index >= 0 ? index + 1 : 0,
    total: collection.episodeCount || episodes.length,
  }
}

function fallbackEntryFromEpisode(episode: CollectionEpisode, collection: CollectionInfo, index: number): VideoEntry {
  return {
    bvid: episode.bvid,
    aid: episode.aid,
    title: episode.title,
    cover: episode.cover,
    description: '',
    duration: episode.duration,
    created: episode.created,
    tid: 0,
    tname: '',
    stat: { view: 0, like: 0, coin: 0, favorite: 0, share: 0, danmaku: 0, reply: 0 },
    cid: episode.cid,
    pages: [{ cid: episode.cid, part: episode.title }],
    collection: { id: collection.id, title: collection.title, index, total: collection.episodeCount },
  }
}

async function fetchVideoDetails(bvid: string, retries = 3): Promise<FetchResult | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await client.get('/x/web-interface/view', { params: { bvid } })
      const d = res.data.data as Record<string, any>
      if (!d) return null

      const collection = parseCollection(d.ugc_season)
      const entry: VideoEntry = {
        bvid: d.bvid as string,
        aid: d.aid as number,
        title: (d.title as string) ?? '',
        cover: (d.pic as string) ?? '',
        description: (d.desc as string) ?? '',
        duration: (d.duration as number) ?? 0,
        created: (d.pubdate as number) ?? 0,
        tid: (d.tid as number) ?? 0,
        tname: (d.tname as string) ?? '',
        stat: (d.stat as VideoStat) ?? { view: 0, like: 0, coin: 0, favorite: 0, share: 0, danmaku: 0, reply: 0 },
        cid: (d.cid as number) ?? 0,
        pages: ((d.pages as Array<any>) ?? []).map((p: any) => ({
          cid: p.cid as number,
          part: (p.part as string) ?? '',
        })),
        collection: collectionRefFor(collection, String(d.bvid ?? bvid)),
      }
      return { entry, collection }
    } catch {
      if (i < retries - 1) {
        await sleep(1000 * (i + 1))
        continue
      }
      return null
    }
  }
  return null
}

export interface ExportOptions {
  uid: number
  concurrency?: number
  delayMs?: number
  onProgress?: (current: number, total: number, bvid: string, title: string) => void
}

export async function exportUp(
  options: ExportOptions,
): Promise<UpData> {
  const { uid, concurrency = 20, delayMs = 50 } = options
  const onProgress = options.onProgress ?? (() => {})

  await ensureDir(DATA_DIR)

  console.log(`获取 UP 主 ${uid} 的视频列表...`)
  const { upName, videos: spaceVideos } = await listAllVideos(uid)
  const totalVideos = spaceVideos.length
  console.log(`共 ${totalVideos} 个视频`)

  const allBvids = spaceVideos.map(v => v.bvid)

  const videos: Record<string, VideoEntry> = {}
  const collections: Record<string, CollectionInfo> = {}
  let completed = 0

  function rememberCollection(collection: CollectionInfo | null) {
    if (!collection) return
    const key = String(collection.id)
    const existing = collections[key]
    // Keep the most complete copy when the API returns a partial season on one
    // of the episode details.
    if (!existing || collection.sections.flatMap(section => section.episodes).length > existing.sections.flatMap(section => section.episodes).length) {
      collections[key] = collection
    }
  }

  async function processBvid(bvid: string, progressTotal = totalVideos) {
    const result = await fetchVideoDetails(bvid)
    if (result) {
      videos[bvid] = result.entry
      rememberCollection(result.collection)
    }
    completed++
    const v = spaceVideos.find(v => v.bvid === bvid)
    onProgress(completed, progressTotal, bvid, v?.title ?? '')
  }

  for (let i = 0; i < allBvids.length; i += concurrency) {
    const chunk = allBvids.slice(i, i + concurrency)
    await Promise.all(chunk.map(processBvid))
    if (i + concurrency < allBvids.length) {
      await sleep(delayMs)
    }
  }

  // The space archive lists the videos uploaded by the UP. A Bilibili 合集 is
  // a separate resource, however: its other episodes are independent BVIDs
  // and are only exposed through `ugc_season` on a video detail response.
  // Fetch those episode details too, so the exported per-account JSON remains
  // self-contained and the frontend can search/open every episode directly.
  const collectionEpisodes = Object.values(collections)
    .flatMap(collection => collection.sections.flatMap(section => section.episodes.map(episode => ({ collection, episode }))))
    .filter(({ episode }) => !videos[episode.bvid])
  const pendingBvids = [...new Set(collectionEpisodes.map(({ episode }) => episode.bvid))]
  if (pendingBvids.length > 0) {
    const finalTotal = totalVideos + pendingBvids.length
    console.log(`发现 ${Object.keys(collections).length} 个合集，补充抓取 ${pendingBvids.length} 个合集视频...`)
    for (let i = 0; i < pendingBvids.length; i += concurrency) {
      const chunk = pendingBvids.slice(i, i + concurrency)
      await Promise.all(chunk.map(bvid => processBvid(bvid, finalTotal)))
      if (i + concurrency < pendingBvids.length) await sleep(delayMs)
    }

    // If a detail request fails, retain a lightweight entry from the season
    // payload rather than silently dropping that episode from the site.
    for (const { collection, episode } of collectionEpisodes) {
      if (videos[episode.bvid]) continue
      const index = collection.sections
        .flatMap(section => section.episodes)
        .findIndex(item => item.bvid === episode.bvid) + 1
      videos[episode.bvid] = fallbackEntryFromEpisode(episode, collection, index)
    }
  }

  // Details for collection episodes normally include the same ugc_season
  // object. Apply refs from the canonical collection map as a final pass so
  // fallback/partial responses are labelled consistently.
  for (const collection of Object.values(collections)) {
    const episodes = collection.sections.flatMap(section => section.episodes)
    episodes.forEach((episode, index) => {
      const video = videos[episode.bvid]
      if (video && !video.collection) {
        video.collection = {
          id: collection.id,
          title: collection.title,
          index: index + 1,
          total: collection.episodeCount || episodes.length,
        }
      }
    })
  }

  const updatedAt = new Date().toISOString()

  const result: UpData = {
    upName,
    uid,
    updatedAt,
    videos,
    collections,
  }

  const fp = dataPath(upName, uid)
  await ensureDir(path.dirname(fp))
  await fsp.writeFile(fp, JSON.stringify(result, null, 2), 'utf-8')
  console.log(`已保存: ${fp} (${Object.keys(videos).length} 个视频)`)

  return result
}

export async function exportAll(
  uids: number[],
  options?: Partial<ExportOptions>,
): Promise<void> {
  for (const uid of uids) {
    console.log(`\n======= UP 主 ${uid} =======`)
    await exportUp({ ...options, uid })
  }
}
