import { describe, expect, it } from 'vitest'
import { addDays, presetRange, presetRangeInZone, rangeError, spanDays, startOfDayInZone } from './range'

describe('presetRange', () => {
  const today = '2026-03-01'
  it('computes each preset from the restaurant-local today', () => {
    expect(presetRange('today', today)).toEqual({ start: today, end: today })
    expect(presetRange('yesterday', today)).toEqual({ start: '2026-02-28', end: '2026-02-28' })
    expect(presetRange('week', today)).toEqual({ start: '2026-02-23', end: today })
    expect(presetRange('month', today)).toEqual({ start: '2026-03-01', end: today })
    expect(presetRange('days30', today)).toEqual({ start: '2026-01-31', end: today })
  })
  it('spans exactly the advertised number of days', () => {
    const w = presetRange('week', '2026-09-28')
    expect(spanDays(w.start, w.end)).toBe(7)
    const m = presetRange('days30', '2026-09-28')
    expect(spanDays(m.start, m.end)).toBe(30)
  })
  it('uses the restaurant zone, not the browser, for "today"', () => {
    // 20:00 UTC on 28 Sept is already 29 Sept in Kolkata (UTC+5:30) but still 28 Sept in New York.
    const now = Date.UTC(2026, 8, 28, 20, 0)
    expect(presetRangeInZone('today', 'Asia/Kolkata', now).start).toBe('2026-09-29')
    expect(presetRangeInZone('today', 'America/New_York', now).start).toBe('2026-09-28')
  })
})

describe('addDays', () => {
  it('crosses months and leap days', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('rangeError', () => {
  it('accepts up to 366 calendar days', () => {
    expect(rangeError('2024-01-01', '2024-12-31')).toBeNull() // 366 days (leap year)
    expect(rangeError('2025-01-01', '2026-01-01')).toBeNull() // 366 days
    expect(rangeError('2025-01-01', '2026-01-02')).toBe('Reports can cover at most one year')
  })
  it('rejects an end before the start, missing and impossible dates', () => {
    expect(rangeError('2026-09-10', '2026-09-09')).toBe('The end date is before the start date')
    expect(rangeError('', '2026-09-09')).toBe('Choose both dates')
    expect(rangeError('2026-02-30', '2026-03-01')).toBe('Enter a valid date')
    expect(rangeError('1999-12-31', '2000-01-02')).toBe('Choose dates between 2000 and 2100')
  })
  it('accepts a single day', () => {
    expect(rangeError('2026-09-28', '2026-09-28')).toBeNull()
  })
})

describe('startOfDayInZone', () => {
  it('converts local midnight to a UTC instant', () => {
    expect(startOfDayInZone('2026-09-28', 'Asia/Kolkata')).toBe('2026-09-27T18:30:00.000Z')
    expect(startOfDayInZone('2026-09-28', 'UTC')).toBe('2026-09-28T00:00:00.000Z')
    expect(startOfDayInZone('2026-09-28', 'Asia/Kathmandu')).toBe('2026-09-27T18:15:00.000Z')
  })
  it('handles daylight saving on both sides of the change', () => {
    expect(startOfDayInZone('2026-03-08', 'America/New_York')).toBe('2026-03-08T05:00:00.000Z') // EST
    expect(startOfDayInZone('2026-03-09', 'America/New_York')).toBe('2026-03-09T04:00:00.000Z') // EDT
    expect(startOfDayInZone('2026-10-25', 'Europe/London')).toBe('2026-10-24T23:00:00.000Z') // BST
    expect(startOfDayInZone('2026-10-26', 'Europe/London')).toBe('2026-10-26T00:00:00.000Z') // GMT
  })
  it('uses the first instant of the day when midnight is skipped', () => {
    // Santiago springs forward at 00:00 → 01:00 on 6 Sept 2026 (UTC−4 → UTC−3).
    expect(startOfDayInZone('2026-09-06', 'America/Santiago')).toBe('2026-09-06T04:00:00.000Z')
  })
  it('uses the first midnight when midnight happens twice, like the backend (fold=0)', () => {
    // Havana falls back 01:00 → 00:00 on 1 Nov 2026: midnight is at 04:00Z (CDT) and again at 05:00Z.
    expect(startOfDayInZone('2026-11-01', 'America/Havana')).toBe('2026-11-01T04:00:00.000Z')
    // Santiago falls back 00:00 → 23:00 on 5 Apr 2026: the day starts once, at 04:00Z.
    expect(startOfDayInZone('2026-04-05', 'America/Santiago')).toBe('2026-04-05T04:00:00.000Z')
    expect(startOfDayInZone('2026-04-04', 'America/Santiago')).toBe('2026-04-04T03:00:00.000Z')
    // Casey went from +11 to +8 at 04:00 on 5 Mar 2010; that day began once, at 13:00Z the day before.
    expect(startOfDayInZone('2010-03-05', 'Antarctica/Casey')).toBe('2010-03-04T13:00:00.000Z')
  })
  it('uses the first instant when midnight is skipped east of UTC', () => {
    // Cairo springs forward 00:00 → 01:00 on 24 Apr 2026.
    expect(startOfDayInZone('2026-04-24', 'Africa/Cairo')).toBe('2026-04-23T22:00:00.000Z')
  })
})
