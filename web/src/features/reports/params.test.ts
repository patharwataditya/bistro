import { describe, expect, it } from 'vitest'
import { parseReportParams } from './params'

const parse = (qs: string) => parseReportParams(new URLSearchParams(qs))

describe('parseReportParams', () => {
  it('defaults to today', () => {
    expect(parse('')).toEqual({ choice: 'today', custom: null, problem: null })
  })
  it('reads a preset', () => {
    expect(parse('range=week')).toEqual({ choice: 'week', custom: null, problem: null })
  })
  it('reads a valid custom range', () => {
    expect(parse('start=2026-09-01&end=2026-09-15')).toEqual({
      choice: 'custom', custom: { start: '2026-09-01', end: '2026-09-15' }, problem: null,
    })
  })
  it('explains an unknown preset instead of silently showing today', () => {
    const p = parse('range=fortnight')
    expect(p.choice).toBe('today')
    expect(p.problem?.message).toMatch(/isn't recognised/)
  })
  it('explains unusable dates and keeps them for correction', () => {
    const backwards = parse('start=2026-09-15&end=2026-09-01')
    expect(backwards.choice).toBe('today')
    expect(backwards.problem).toEqual({
      message: "This link's dates can't be used (the end date is before the start date), so today is shown.",
      draft: { start: '2026-09-15', end: '2026-09-01' },
    })
    expect(parse('start=2026-02-30&end=2026-03-01').problem?.message).toMatch(/enter a valid date/)
    expect(parse('start=2026-09-01').problem?.message).toMatch(/choose both dates/)
    expect(parse('start=1999-01-01&end=1999-01-02').problem?.message).toMatch(/between 2000 and 2100/)
    expect(parse('start=2024-01-01&end=2025-06-01').problem?.message).toMatch(/at most one year/)
  })
})
