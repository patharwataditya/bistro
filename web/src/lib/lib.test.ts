import { clock, compareMoney, elapsed, isPositive, isZero, localDate, percent, plural, signedMoney } from './format'
import { IntentKey } from './idempotency'
import { acceptMoney, parseMoney } from './money-input'

describe('money input', () => {
  it.each(['', '0', '12', '12.', '12.5', '12.50', '12,5', '9999999999.99'])('accepts %j while typing', (t) => {
    expect(acceptMoney(t)).toBe(true)
  })
  it.each(['-1', '1.234', '1e3', 'abc', '12.5.0', '99999999999', ' 1'])('rejects %j', (t) => {
    expect(acceptMoney(t)).toBe(false)
  })
  it('normalises to a two-decimal string without floats', () => {
    expect(parseMoney('12')).toBe('12.00')
    expect(parseMoney('12,5')).toBe('12.50')
    expect(parseMoney('007.1')).toBe('7.10')
    expect(parseMoney('0.1')).toBe('0.10')
    expect(parseMoney('9999999999.99')).toBe('9999999999.99')
  })
  it('refuses incomplete or malformed amounts', () => {
    for (const t of ['', '.', ',', '1.234', '-2', 'x']) expect(parseMoney(t)).toBeNull()
  })
})

describe('money compare and signs', () => {
  it('compares exactly regardless of padding', () => {
    expect(compareMoney('10.00', '9.99')).toBe(1)
    expect(compareMoney('0.1', '0.10')).toBe(0)
    expect(compareMoney('00012.5', '12.49')).toBe(1)
    expect(compareMoney('1234567890.01', '1234567890.02')).toBe(-1)
  })
  it('detects zero and positive values', () => {
    expect(isZero('0.00')).toBe(true)
    expect(isZero('-0.00')).toBe(true)
    expect(isZero('0.01')).toBe(false)
    expect(isPositive('0.01')).toBe(true)
    expect(isPositive('-3.00')).toBe(false)
    expect(isPositive('0')).toBe(false)
  })
  it('signs refunds and never signs zero', () => {
    expect(signedMoney('-5.00', 'USD')).toMatch(/^−/)
    expect(signedMoney('5.00', 'USD')).toMatch(/^\+/)
    expect(signedMoney('0.00', 'USD')).not.toMatch(/^[+−]/)
  })
  it('trims percent zeros', () => {
    expect(percent('5.00')).toBe('5%')
    expect(percent('12.50')).toBe('12.5%')
    expect(percent('18')).toBe('18%')
  })
})

describe('time formatting', () => {
  const start = '2026-09-28T10:00:00Z'
  const at = (s: number) => Date.parse(start) + s * 1000
  it('shows kitchen timers as durations, never clock times', () => {
    expect(clock(start, at(0))).toBe('0m 00s')
    expect(clock(start, at(14 * 60 + 5))).toBe('14m 05s')
    expect(clock(start, at(3600 + 125))).toBe('1h 02m')
    expect(clock(start, at(-30))).toBe('0m 00s')
  })
  it('shows compact elapsed time', () => {
    expect(elapsed(start, at(30))).toBe('now')
    expect(elapsed(start, at(47 * 60))).toBe('47m')
    expect(elapsed(start, at(72 * 60))).toBe('1h 12m')
  })
  it('computes the restaurant-local date, not the browser date', () => {
    const instant = Date.parse('2026-09-28T20:00:00Z')
    expect(localDate('Asia/Kolkata', instant)).toBe('2026-09-29')
    expect(localDate('America/Los_Angeles', instant)).toBe('2026-09-28')
  })
  it('pluralises', () => {
    expect(plural(1, 'guest')).toBe('1 guest')
    expect(plural(3, 'guest')).toBe('3 guests')
  })
})

describe('IntentKey', () => {
  it('reuses the key for a retry of the same intent and rotates for a new one', () => {
    const k = new IntentKey()
    const a = k.keyFor('bill:1:v3:CASH:10.00')
    expect(k.keyFor('bill:1:v3:CASH:10.00')).toBe(a)
    const b = k.keyFor('bill:1:v3:CASH:12.00')
    expect(b).not.toBe(a)
    k.reset()
    expect(k.keyFor('bill:1:v3:CASH:12.00')).not.toBe(b)
  })
})
