import { describe, expect, it } from 'vitest'
import { AUDIT_CHIPS, displayValue, humanize, toAuditQuery } from './filters'

const zone = 'Asia/Kolkata'
const none = { chip: 'all', actorId: null, from: '', to: '' }

describe('toAuditQuery', () => {
  it('sends nothing for the unfiltered log', () => {
    expect(toAuditQuery(none, zone)).toEqual({})
  })
  it('maps each chip to its action prefix', () => {
    const prefixes = AUDIT_CHIPS.map((c) => toAuditQuery({ ...none, chip: c.key }, zone).action ?? null)
    expect(prefixes).toEqual([null, 'order.', 'bill.', 'payment.', 'staff.', 'role.', 'menu.', 'settings.', 'table.', 'area.', 'kitchen.'])
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
