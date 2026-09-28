import { describe, expect, it } from 'vitest'
import { AUDIT_CHIPS, dateRangeError, displayValue, humanize, isCommittableDate, toAuditQuery } from './filters'

const zone = 'Asia/Kolkata'
const none = { chip: 'all', actorId: null, from: '', to: '' }

describe('toAuditQuery', () => {
  it('sends nothing for the unfiltered log', () => {
    expect(toAuditQuery(none, zone)).toEqual({})
  })
  it('maps each chip to its action prefix', () => {
    const prefixes = AUDIT_CHIPS.map((c) => toAuditQuery({ ...none, chip: c.key }, zone).action ?? null)
    expect(prefixes).toEqual([null, 'order.', 'bill.', 'payment.', 'staff.', 'role.', 'menu.', 'settings.', 'table.', 'area.'])
  })
  it('falls back to All for an unknown chip', () => {
    expect(toAuditQuery({ ...none, chip: 'nope' }, zone).action).toBeUndefined()
  })
  it('passes the actor', () => {
    expect(toAuditQuery({ ...none, actorId: 7 }, zone)).toEqual({ actorId: 7 })
  })
  it('turns inclusive local dates into a [since, until) window in the restaurant zone', () => {
    expect(toAuditQuery({ ...none, from: '2026-09-03', to: '2026-09-05' }, zone)).toEqual({
      since: '2026-09-02T18:30:00.000Z',
      until: '2026-09-05T18:30:00.000Z',
    })
  })
  it('allows open-ended ranges', () => {
    expect(toAuditQuery({ ...none, from: '2026-09-03' }, 'UTC')).toEqual({ since: '2026-09-03T00:00:00.000Z' })
    expect(toAuditQuery({ ...none, to: '2026-09-03' }, 'UTC')).toEqual({ until: '2026-09-04T00:00:00.000Z' })
  })
  it('drops a backwards range instead of sending it', () => {
    expect(toAuditQuery({ ...none, chip: 'orders', from: '2026-09-05', to: '2026-09-03' }, zone)).toEqual({ action: 'order.' })
  })
})

describe('date filters', () => {
  it('holds back half-typed years and out-of-range dates', () => {
    expect(isCommittableDate('')).toBe(true)
    expect(isCommittableDate('2026-09-28')).toBe(true)
    expect(isCommittableDate('0002-09-28')).toBe(false)
    expect(isCommittableDate('0202-09-28')).toBe(false)
    expect(isCommittableDate('1999-12-31')).toBe(false)
  })
  it('never sends a range with a year before 2000', () => {
    expect(dateRangeError('1999-12-31', '')).toBe('Choose a date between 2000 and 2100')
    expect(dateRangeError('0020-01-01', '')).not.toBeNull()
    expect(toAuditQuery({ ...none, from: '0020-01-01' }, zone)).toEqual({})
  })
  it('has no Kitchen chip (the server records no kitchen actions)', () => {
    expect(AUDIT_CHIPS.map((c) => c.key)).not.toContain('kitchen')
  })
})

describe('metadata display', () => {
  it('humanizes keys', () => expect(humanize('payment_method_id')).toBe('Payment method id'))
  it('renders values as plain text', () => {
    expect(displayValue('<b>x</b>')).toBe('<b>x</b>')
    expect(displayValue(12)).toBe('12')
    expect(displayValue(false)).toBe('false')
    expect(displayValue(null)).toBe('—')
    expect(displayValue(['a', 'b'])).toBe('a, b')
    expect(displayValue({ from: 'A', to: 'B' })).toBe('{\n  "from": "A",\n  "to": "B"\n}')
  })
})
