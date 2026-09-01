import axios from 'axios'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

export interface DownloadProgress {
  bytesDownloaded: number
  totalBytes: number | null
  percent: number | null
}

export type ProgressCallback = (p: DownloadProgress) => void

export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const dir = path.dirname(destPath)
  await fsp.mkdir(dir, { recursive: true })

  const res = await axios.get(url, {
    responseType: 'stream',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.bilibili.com/',
    },
  })

  const contentLength = res.headers['content-length']
  const totalBytes = contentLength ? parseInt(String(contentLength), 10) || null : null
  let bytesDownloaded = 0

  const writer = fs.createWriteStream(destPath)

  res.data.on('data', (chunk: Buffer) => {
    bytesDownloaded += chunk.length
    if (onProgress) {
      onProgress({
        bytesDownloaded,
        totalBytes,
        percent: totalBytes ? Math.round((bytesDownloaded / totalBytes) * 100) : null,
      })
    }
  })

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
    res.data.pipe(writer)
  })
}

export async function ensureFfmpeg(): Promise<boolean> {
  return new Promise(resolve => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' })
    proc.on('error', () => resolve(false))
    proc.on('exit', code => resolve(code === 0))
  })
}

export async function mergeStreams(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  onProgress?: (line: string) => void,
): Promise<void> {
  const dir = path.dirname(outputPath)
  await fsp.mkdir(dir, { recursive: true })

  return new Promise((resolve, reject) => {
    const ext = path.extname(audioPath).toLowerCase()
    const container = ext === '.flac' ? '.mkv' : '.mp4'
    const finalPath = outputPath.replace(/\.[^.]+$/, '') + container

    const ffmpegArgs = [
      '-i', videoPath,
      '-i', audioPath,
      '-c', 'copy',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-y',
      finalPath,
    ]

    const proc = spawn('ffmpeg', ffmpegArgs)

    proc.stderr.on('data', (data: Buffer) => {
      const line = data.toString()
      if (onProgress) onProgress(line)
    })

    proc.on('close', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`ffmpeg 退出码: ${code}`))
      }
    })

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error('未找到 ffmpeg，请先安装: brew install ffmpeg'))
      } else {
        reject(err)
      }
    })
  })
}
