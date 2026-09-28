import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import type { Bill, PaymentRecord } from '@/api/types'
import { IntentKey } from '@/lib/idempotency'
import { payFingerprint, refused } from './intents'
import {
  billActions, canDiscount, canRefund, canSettleZero, canTakePayment, canVoid, fromCents, localMidnightIso, netPaid,
  paidFraction, quickTenders, refundableByMethod, toCents,
} from './billMath'

let seq = 0
function payment(over: Partial<PaymentRecord>): PaymentRecord {
  seq += 1
  return {
    id: seq, kind: 'PAYMENT', payment_method_id: 1, method_name: 'Cash', amount: '0.00', tendered: null, change_due: '0.00',
    reference: null, reason: null, is_correction: false, created_by_name: 'Carlos Cashier', created_at: '2026-09-28T12:00:00Z', ...over,
  }
}

function bill(over: Partial<Bill> = {}): Bill {
  return {
    id: 7, bill_number: 'B-000007', status: 'OPEN', order_id: 3, order_number: 12, table_name: 'T2', server_name: 'Sofia Server',
    guest_count: 2, currency_code: 'INR', subtotal: '800.00', discount_type: null, discount_value: null, discount_amount: '0.00',
    discount_reason: null, service_charge_percent: '5.00', service_charge_amount: '40.00', taxes: [], tax_total: '42.00',
    round_off: '0.00', total: '882.00', paid_total: '0.00', refunded_total: '0.00', balance_due: '882.00', payments: [],
    created_by_name: 'Carlos Cashier', created_at: '2026-09-28T12:00:00Z', paid_at: null, voided_at: null, void_reason: null,
    version: 1, ...over,
  }
}

const ALL = { pay: true, discount: true, refund: true, void: true }
const NONE = { pay: false, discount: false, refund: false, void: false }

describe('cents', () => {
  it('round-trips decimal strings exactly', () => {
    expect(toCents('12.5')).toBe(1250n)
    expect(toCents('0.10')).toBe(10n)
    expect(toCents('-3.07')).toBe(-307n)
    expect(fromCents(1250n)).toBe('12.50')
    expect(fromCents(-5n)).toBe('-0.05')
    expect(netPaid({ paid_total: '813.64', refunded_total: '100.00' })).toBe('713.64')
  })
})

describe('bill action eligibility', () => {
  it('open bill with a balance: pay, discount, void — nothing to refund yet', () => {
    const b = bill()
    expect(billActions(b, ALL)).toEqual({ takePayment: true, settleZero: false, discount: true, refund: false, void: true })
  })

  it('respects permissions on top of the bill state', () => {
    expect(billActions(bill(), NONE)).toEqual({ takePayment: false, settleZero: false, discount: false, refund: false, void: false })
    expect(billActions(bill(), { ...NONE, pay: true })).toMatchObject({ takePayment: true, discount: false, void: false })
  })

  it('a partly paid open bill can be paid or corrected, but not discounted or voided', () => {
    const b = bill({ paid_total: '500.00', balance_due: '382.00', payments: [payment({ amount: '500.00' })] })
    expect(canTakePayment(b)).toBe(true)
    expect(canDiscount(b)).toBe(false)
    expect(canVoid(b)).toBe(false)
    expect(canRefund(b)).toBe(true)
  })

  it('after every payment is corrected, discount and void come back', () => {
    const b = bill({
      paid_total: '150.00', refunded_total: '150.00',
      payments: [payment({ amount: '150.00' }), payment({ kind: 'REFUND', amount: '150.00', is_correction: true })],
    })
    expect(canDiscount(b)).toBe(true)
    expect(canVoid(b)).toBe(true)
    expect(canRefund(b)).toBe(false)
  })

  it('a zero-total open bill is closed, not paid', () => {
    const b = bill({ total: '0.00', balance_due: '0.00' })
    expect(canTakePayment(b)).toBe(false)
    expect(canSettleZero(b)).toBe(true)
  })

  it('paid bills refund; void and fully refunded bills do nothing', () => {
    const paid = bill({ status: 'PAID', paid_total: '882.00', balance_due: '0.00', payments: [payment({ amount: '882.00' })] })
    expect(billActions(paid, ALL)).toEqual({ takePayment: false, settleZero: false, discount: false, refund: true, void: false })
    const refunded = bill({
      status: 'REFUNDED', paid_total: '882.00', refunded_total: '882.00', balance_due: '0.00',
      payments: [payment({ amount: '882.00' }), payment({ kind: 'REFUND', amount: '882.00' })],
    })
    expect(billActions(refunded, ALL)).toEqual({ takePayment: false, settleZero: false, discount: false, refund: false, void: false })
    expect(billActions(bill({ status: 'VOID' }), ALL).void).toBe(false)
  })
})

describe('refundable by method', () => {
  it('nets refunds per method and drops methods with nothing held', () => {
    const b = bill({
      payments: [
        payment({ payment_method_id: 1, method_name: 'Cash', amount: '200.00' }),
        payment({ payment_method_id: 2, method_name: 'Card', amount: '500.00' }),
        payment({ payment_method_id: 1, method_name: 'Cash', amount: '100.00' }),
        payment({ payment_method_id: 2, method_name: 'Card', amount: '120.50', kind: 'REFUND' }),
        payment({ payment_method_id: 3, method_name: 'UPI', amount: '50.00' }),
        payment({ payment_method_id: 3, method_name: 'UPI', amount: '50.00', kind: 'REFUND', is_correction: true }),
      ],
    })
    expect(refundableByMethod(b)).toEqual([
      { methodId: 1, methodName: 'Cash', amount: '300.00' },
      { methodId: 2, methodName: 'Card', amount: '379.50' },
    ])
  })

  it('is empty when no money was taken', () => {
    expect(refundableByMethod(bill())).toEqual([])
  })
})

describe('quick tenders', () => {
  it('offers the exact amount then the next three round notes above it', () => {
    expect(quickTenders('382.00')).toEqual(['382.00', '390.00', '400.00', '500.00'])
    expect(quickTenders('813.64')).toEqual(['813.64', '820.00', '850.00', '900.00'])
    expect(quickTenders('1234.50')).toEqual(['1234.50', '1240.00', '1250.00', '1300.00'])
  })

  it('never repeats an amount that is already round', () => {
    expect(quickTenders('500.00')).toEqual(['500.00', '1000.00', '2000.00'])
    expect(quickTenders('2000.00')).toEqual(['2000.00'])
  })

  it('offers nothing for zero', () => {
    expect(quickTenders('0.00')).toEqual([])
  })
})

describe('paid progress', () => {
  it('is the share held after refunds, clamped', () => {
    expect(paidFraction({ total: '800.00', paid_total: '200.00', refunded_total: '0.00' })).toBe(0.25)
    expect(paidFraction({ total: '800.00', paid_total: '200.00', refunded_total: '200.00' })).toBe(0)
    expect(paidFraction({ total: '0.00', paid_total: '0.00', refunded_total: '0.00' })).toBe(0)
  })
})

describe('paid today', () => {
  it('starts at local midnight in the restaurant time zone', () => {
    // 02:00 UTC is 07:30 in Kolkata: today there began at 18:30 UTC the day before.
    expect(localMidnightIso('Asia/Kolkata', Date.parse('2026-09-28T02:00:00Z'))).toBe('2026-09-27T18:30:00.000Z')
    expect(localMidnightIso('UTC', Date.parse('2026-09-28T23:59:00Z'))).toBe('2026-09-28T00:00:00.000Z')
    expect(localMidnightIso('America/New_York', Date.parse('2026-01-15T03:00:00Z'))).toBe('2026-01-14T05:00:00.000Z')
  })

  it('handles a DST change day', () => {
    // New York springs forward on 2026-03-08; midnight is still EST (UTC−5).
    expect(localMidnightIso('America/New_York', Date.parse('2026-03-08T18:00:00Z'))).toBe('2026-03-08T05:00:00.000Z')
    expect(localMidnightIso('America/New_York', Date.parse('2026-03-09T18:00:00Z'))).toBe('2026-03-09T04:00:00.000Z')
  })
})

describe('payment intents', () => {
  it('replays a retry of the same charge, but a new version or amount is a new intent', () => {
    const keys = new IntentKey()
    const charge = { methodId: 1, amount: '200.00', tendered: '500.00', reference: null }
    const first = keys.keyFor(payFingerprint(7, 3, charge))
    expect(keys.keyFor(payFingerprint(7, 3, charge))).toBe(first)
    expect(keys.keyFor(payFingerprint(7, 4, charge))).not.toBe(first)
    const v4 = keys.keyFor(payFingerprint(7, 4, charge))
    expect(keys.keyFor(payFingerprint(7, 4, { ...charge, amount: '201.00' }))).not.toBe(v4)
  })

  it('drops the key only when the server definitively refused', () => {
    expect(refused(new ApiError('stale', 'x'))).toBe(true)
    expect(refused(new ApiError('validation', 'x'))).toBe(true)
    expect(refused(new ApiError('conflict', 'x'))).toBe(true)
    expect(refused(new ApiError('offline', 'x'))).toBe(false)
    expect(refused(new ApiError('timeout', 'x'))).toBe(false)
    expect(refused(new ApiError('server', 'x'))).toBe(false)
  })
})
