import { describe, expect, it } from 'vitest'
import { greeting, greetingFor, hourInZone } from './greeting'

describe('greeting', () => {
  it('matches Android’s hour bands', () => {
    expect(greetingFor(5)).toBe('Good morning')
    expect(greetingFor(11)).toBe('Good morning')
    expect(greetingFor(12)).toBe('Good afternoon')
    expect(greetingFor(16)).toBe('Good afternoon')
    expect(greetingFor(17)).toBe('Good evening')
    expect(greetingFor(2)).toBe('Good evening')
  })
  it('uses the restaurant time zone', () => {
    const now = Date.UTC(2026, 8, 28, 2, 0) // 07:30 in Kolkata, 22:00 the day before in New York
    expect(hourInZone('Asia/Kolkata', now)).toBe(7)
    expect(greeting('Maya Manager', 'Asia/Kolkata', now)).toBe('Good morning, Maya')
    expect(greeting('Maya Manager', 'America/New_York', now)).toBe('Good evening, Maya')
  })
})
