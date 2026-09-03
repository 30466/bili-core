export const BEIJING_TIME_ZONE = 'Asia/Shanghai'

const beijingDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BEIJING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function unixSecondsToDate(value: number): Date | null {
  if (!Number.isFinite(value) || value <= 0) return null
  const date = new Date(value * 1000)
  return Number.isFinite(date.getTime()) ? date : null
}

export function formatBeijingDateFromUnixSeconds(value: number): string {
  const date = unixSecondsToDate(value)
  if (!date) return ''
  const parts: Record<string, string> = {}
  for (const part of beijingDateFormatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function utcIsoFromUnixSeconds(value: number): string {
  return unixSecondsToDate(value)?.toISOString() ?? ''
}
