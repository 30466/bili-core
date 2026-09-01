import { apiGet, apiGetNoSign } from './client.js'

export interface CidInfo {
  cid: number
  page: number
  part: string
}

export interface VideoInfo {
  bvid: string
  title: string
  cid: number
  pages: CidInfo[]
  ownerName: string
  ownerMid: number
  duration: number
}

export interface DashStream {
  id: number
  baseUrl: string
  base_url: string
  backupUrl?: string[]
  backup_url?: string[]
  bandwidth: number
  mimeType: string
  mime_type: string
  codecs: string
  codecid: number
  width?: number
  height?: number
  frameRate?: string
  frame_rate?: string
  sar?: string
  startWithSap?: number
  start_with_sap?: number
  segmentBase?: {
    initialization: string
    indexRange: string
  }
  segment_base?: {
    initialization: string
    index_range: string
  }
}

export interface DolbyInfo {
  type: number
  audio?: DashStream[]
}

export interface FlacInfo {
  display: boolean
  audio?: DashStream
}

export interface DashData {
  duration: number
  minBufferTime: number
  min_buffer_time: number
  video: DashStream[]
  audio: DashStream[] | null
  dolby?: DolbyInfo
  flac?: FlacInfo
}

export interface PlayUrlData {
  from: string
  result: string
  message: string
  quality: number
  format: string
  timelength: number
  acceptFormat: string
  acceptDescription: string[]
  acceptQuality: number[]
  videoCodecid: number
  seekParam: string
  seekType: string
  dash: DashData
}

export async function getVideoInfo(bvid: string): Promise<VideoInfo> {
  const data = await apiGetNoSign<Record<string, unknown>>('/x/web-interface/view', { bvid })

  const pages = (data.pages as Array<Record<string, unknown>> ?? []).map(p => ({
    cid: p.cid as number,
    page: p.page as number,
    part: (p.part as string) ?? '',
  }))

  const owner = data.owner as Record<string, unknown> | undefined

  return {
    bvid: data.bvid as string,
    title: (data.title as string) ?? '',
    cid: data.cid as number,
    pages,
    ownerName: (owner?.name as string) ?? '',
    ownerMid: (owner?.mid as number) ?? 0,
    duration: (data.duration as number) ?? 0,
  }
}

export async function getPlayUrl(
  bvid: string,
  cid: number,
  hiRes = false,
): Promise<PlayUrlData> {
  const params: Record<string, string | number> = {
    bvid,
    cid,
    fnval: hiRes ? 4048 : 16,
    fourk: 1,
  }

  const data = await apiGet<PlayUrlData>('/x/player/wbi/playurl', params)
  return data
}

export function pickBestAudio(dash: DashData): DashStream | null {
  if (dash.flac?.audio) {
    return dash.flac.audio
  }
  if (dash.dolby?.audio?.length) {
    const dolbyAudios = [...dash.dolby.audio].sort((a, b) => b.bandwidth - a.bandwidth)
    return dolbyAudios[0]
  }
  if (!dash.audio?.length) {
    return null
  }
  const audios = [...dash.audio].sort((a, b) => b.bandwidth - a.bandwidth)
  return audios[0] ?? null
}

export function pickBestVideo(dash: DashData): DashStream | null {
  if (!dash.video?.length) {
    return null
  }
  const videos = [...dash.video].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
  return videos[0] ?? null
}

export function getAudioExt(stream: DashStream): string {
  const codecs = stream.codecs ?? ''
  if (codecs.includes('fLaC')) return '.flac'
  if (codecs.startsWith('mp4a')) return '.m4a'
  if (codecs.includes('ec-3')) return '.eac3'
  if (codecs.includes('ac-3')) return '.ac3'
  return '.m4a'
}

export function getVideoExt(_stream: DashStream): string {
  return '.mp4'
}
