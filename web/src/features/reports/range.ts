/**
 * Calendar maths for report and log ranges. Everything works on plain `YYYY-MM-DD` strings in
 * the restaurant's time zone (never the browser's), so a manager travelling abroad still sees
 * the restaurant's "today".
 */
import { localDate } from '@/lib/format'

export const PRESETS = ['today', 'yesterday', 'week', 'month', 'days30'] as const
export type Preset = (typeof PRESETS)[number]

export const PRESET_LABEL: Record<Preset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Last 7 days',
  month: 'This month',
  days30: 'Last 30 days',
}

/** The API refuses spans where end − start ≥ 366 days, i.e. more than 366 calendar days. */
export const MAX_RANGE_DAYS = 366
export const EARLIEST_DATE = '2000-01-01'
export const LATEST_DATE = '2100-12-31'

export interface DateRange {
  start: string
  end: string
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(date: string): [number, number, number] {
  const m = ISO_DATE.exec(date)
  if (!m) throw new Error(`Not a date: ${date}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date)
  return fromUtc(Date.UTC(y, m - 1, d + days))
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`
}

/** Calendar days from start to end inclusive (1 for a single day). */
export function spanDays(start: string, end: string): number {
  const [ay, am, ad] = parts(start)
  const [by, bm, bd] = parts(end)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000) + 1
}

export function presetRange(preset: Preset, today: string): DateRange {
  switch (preset) {
    case 'today':
      return { start: today, end: today }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { start: y, end: y }
    }
    case 'week':
      return { start: addDays(today, -6), end: today }
    case 'month':
      return { start: startOfMonth(today), end: today }
    case 'days30':
      return { start: addDays(today, -29), end: today }
  }
}

/** Today in the restaurant's zone, then the preset. */
export function presetRangeInZone(preset: Preset, zone: string, now: number = Date.now()): DateRange {
  return presetRange(preset, localDate(zone, now))
}

/** A person-readable problem with a custom range, or null when the API will accept it. */
export function rangeError(start: string, end: string): string | null {
  if (!start || !end) return 'Choose both dates'
  if (!isIsoDate(start) || !isIsoDate(end)) return 'Enter a valid date'
  if (start < EARLIEST_DATE || end > LATEST_DATE) return 'Choose dates between 2000 and 2100'
  if (end < start) return 'The end date is before the start date'
  if (spanDays(start, end) > MAX_RANGE_DAYS) return 'Reports can cover at most one year'
  return null
}

/** Offset (ms) of `zone` from UTC at the instant `ms`. */
function zoneOffset(ms: number, zone: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, number> = {}
  for (const part of f.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value)
  }
  const asUtc = Date.UTC(p.year ?? 1970, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0)
  return asUtc - Math.floor(ms / 1000) * 1000
}

/**
 * The UTC instant of local midnight at the start of `date` in `zone` (DST-safe: if midnight
 * doesn't exist that day, the first instant of the day).
 */
export function startOfDayInZone(date: string, zone: string): string {
  const [y, m, d] = parts(date)
  const wall = Date.UTC(y, m - 1, d)
  let guess = wall - zoneOffset(wall, zone)
  // A second pass settles the offset when a DST change falls between the two instants.
  guess = wall - zoneOffset(guess, zone)
  if (localDate(zone, guess) !== date || localDate(zone, guess - 1) === date) {
    // Midnight doesn't exist that day (zones that spring forward at 00:00): find the day's
    // first instant by bisection, to the minute.
    let lo = guess - 4 * 3_600_000
    let hi = guess + 4 * 3_600_000
    while (hi - lo > 60_000) {
      const mid = lo + Math.floor((hi - lo) / 2)
      if (localDate(zone, mid) >= date) hi = mid
      else lo = mid
    }
    guess = hi - (hi % 60_000)
  }
  return new Date(guess).toISOString()
}

/** Human label for a range: "28 Sept 2026" or "22 Sept – 28 Sept 2026". */
export function rangeLabel(r: DateRange): string {
  const fmt = (s: string, withYear: boolean) => {
    const [y, m, d] = parts(s)
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)))
  }
  if (r.start === r.end) return fmt(r.start, true)
  const sameYear = r.start.slice(0, 4) === r.end.slice(0, 4)
  return `${fmt(r.start, !sameYear)} – ${fmt(r.end, true)}`
}
