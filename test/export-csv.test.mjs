import assert from 'node:assert/strict'
import test from 'node:test'
import { generateCsv } from '../dist/export.js'

const emptyStat = {
  view: 0,
  like: 0,
  coin: 0,
  favorite: 0,
  share: 0,
  danmaku: 0,
  reply: 0,
}

test('CSV 保持简表并标明多 P 数量和合集摘要', () => {
  const csv = generateCsv({
    BVsingle: {
      bvid: 'BVsingle',
      aid: 1,
      title: '普通单P视频',
      cover: '',
      description: '',
      duration: 10,
      created: 1700000000,
      tid: 0,
      tname: '',
      stat: emptyStat,
      cid: 101,
      pages: [{ cid: 101, part: '普通单P视频' }],
    },
    BVmulti: {
      bvid: 'BVmulti',
      aid: 2,
      title: '多P视频',
      cover: '',
      description: '',
      duration: 20,
      created: 1700000000,
      tid: 0,
      tname: '',
      stat: emptyStat,
      cid: 201,
      pages: [
        { cid: 201, part: 'P1' },
        { cid: 202, part: 'P2' },
      ],
      collection: { id: 88, title: '测试合集', index: 3, total: 9 },
    },
  })

  const lines = csv.trimEnd().split('\n')
  assert.equal(
    lines[0],
    'bvid,aid,title,duration,created,view,like,coin,favorite,share,danmaku,reply,page_count,collection_id,collection_title,collection_index,collection_total,url',
  )
  assert.equal(
    lines[1],
    'BVsingle,1,普通单P视频,10,2023-11-14T22:13:20.000Z,0,0,0,0,0,0,0,1,,,,,https://www.bilibili.com/video/BVsingle',
  )
  assert.equal(
    lines[2],
    'BVmulti,2,多P视频,20,2023-11-14T22:13:20.000Z,0,0,0,0,0,0,0,2,88,测试合集,3,9,https://www.bilibili.com/video/BVmulti',
  )
})

test('CSV 正确转义逗号、双引号和换行', () => {
  const csv = generateCsv({
    BVescape: {
      bvid: 'BVescape',
      aid: 3,
      title: '标题, "测试"',
      cover: '',
      description: '',
      duration: 30,
      created: 0,
      tid: 0,
      tname: '',
      stat: emptyStat,
      cid: 301,
      pages: [{ cid: 301, part: 'P1' }],
      collection: { id: 99, title: '合集\n第二行', index: 1, total: 1 },
    },
  })

  assert.match(csv, /"标题, ""测试"""/)
  assert.match(csv, /"合集\n第二行"/)
})
