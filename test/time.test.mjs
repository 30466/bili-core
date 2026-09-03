import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatBeijingDateFromUnixSeconds,
  utcIsoFromUnixSeconds,
} from '../dist/index.js'

test('B站 Unix 发布时间固定转换为北京时间日期', () => {
  const publishedAt = Date.parse('2026-08-28T16:30:00Z') / 1000
  assert.equal(formatBeijingDateFromUnixSeconds(publishedAt), '2026-08-29')
  assert.equal(utcIsoFromUnixSeconds(publishedAt), '2026-08-28T16:30:00.000Z')
})

test('无效发布时间不伪装成 1970 年', () => {
  assert.equal(formatBeijingDateFromUnixSeconds(0), '')
  assert.equal(formatBeijingDateFromUnixSeconds(Number.NaN), '')
  assert.equal(utcIsoFromUnixSeconds(0), '')
})
