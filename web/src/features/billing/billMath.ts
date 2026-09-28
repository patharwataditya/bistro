/**
 * Read-only views over server figures (Android BillMath.kt). Nothing here decides an amount
 * the server will charge: these only choose what to show and which actions to offer. The
 * arithmetic is exact (integer cents), never binary floating point.
 */
import type { Bill, BillStatus } from '@/api/types'

/** "12.50" → 1250n. Server money has two decimals; anything beyond is ignored. */
export function toCents(amount: string): bigint {
  const t = amount.trim()
  const neg = t.startsWith('-')
  const [i = '0', f = ''] = t.replace(/^[-+]/, '').split('.')
  const cents = BigInt(i === '' ? '0' : i) * 100n + BigInt(`${f}00`.slice(0, 2))
  return neg ? -cents : cents
}

/** 1250n → "12.50". */
export function fromCents(cents: bigint): string {
  const neg = cents < 0n
  const abs = neg ? -cents : cents
  const whole = abs / 100n
  const frac = String(abs % 100n).padStart(2, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

export const subtractMoney = (a: string, b: string): string => fromCents(toCents(a) - toCents(b))

type BillFigures = Pick<Bill, 'status' | 'paid_total' | 'refunded_total' | 'balance_due' | 'total' | 'payments'>

/** Money held on the bill: payments minus refunds. */
export const netPaid = (bill: Pick<Bill, 'paid_total' | 'refunded_total'>): string => subtractMoney(bill.paid_total, bill.refunded_total)

export const hasNetPayment = (bill: Pick<Bill, 'paid_total' | 'refunded_total'>): boolean =>
  toCents(bill.paid_total) - toCents(bill.refunded_total) > 0n

export const hasRefunds = (bill: Pick<Bill, 'refunded_total'>): boolean => toCents(bill.refunded_total) > 0n

/** One method's money on this bill, which is also the most that can go back on it. */
export interface Refundable {
  methodId: number
  methodName: string
  amount: string
}

/** Mirrors the server's per-method cap: refunds go back only on the method the money came in on. */
export function refundableByMethod(bill: Pick<Bill, 'payments'>): Refundable[] {
  const byMethod = new Map<number, { name: string; held: bigint }>()
  for (const p of bill.payments) {
    const entry = byMethod.get(p.payment_method_id) ?? { name: p.method_name, held: 0n }
    if (p.kind === 'PAYMENT') entry.held += toCents(p.amount)
    else if (p.kind === 'REFUND') entry.held -= toCents(p.amount)
    entry.name = p.method_name
    byMethod.set(p.payment_method_id, entry)
  }
  const out: Refundable[] = []
  for (const [methodId, { name, held }] of byMethod) {
    if (held > 0n) out.push({ methodId, methodName: name, amount: fromCents(held) })
  }
  return out
}

const is = (bill: Pick<Bill, 'status'>, ...statuses: BillStatus[]): boolean => (statuses as string[]).includes(bill.status)

export const canTakePayment = (bill: BillFigures): boolean => is(bill, 'OPEN') && toCents(bill.balance_due) > 0n
export const canSettleZero = (bill: BillFigures): boolean => is(bill, 'OPEN') && toCents(bill.total) === 0n
export const canDiscount = (bill: BillFigures): boolean => is(bill, 'OPEN') && !hasNetPayment(bill)
export const canVoid = (bill: BillFigures): boolean => is(bill, 'OPEN') && !hasNetPayment(bill)
export const canRefund = (bill: BillFigures): boolean =>
  is(bill, 'OPEN', 'PAID', 'PARTIALLY_REFUNDED') && refundableByMethod(bill).length > 0

export interface BillPermissions {
  pay: boolean
  discount: boolean
  refund: boolean
  void: boolean
}

export interface BillActions {
  takePayment: boolean
  settleZero: boolean
  discount: boolean
  refund: boolean
  void: boolean
}

/** What this person can do to this bill right now: its state (BillMath) and their permissions. */
export function billActions(bill: BillFigures, can: BillPermissions): BillActions {
  return {
    takePayment: can.pay && canTakePayment(bill),
    settleZero: can.pay && canSettleZero(bill),
    discount: can.discount && canDiscount(bill),
    refund: can.refund && canRefund(bill),
    void: can.void && canVoid(bill),
  }
}

/** Cash quick-tender suggestions: the exact amount, then the next three round notes above it. */
export function quickTenders(amount: string): string[] {
  const exact = toCents(amount)
  if (exact <= 0n) return []
  const rounded = new Set<bigint>()
  for (const step of [10n, 50n, 100n, 500n, 1000n, 2000n]) {
    const s = step * 100n
    const up = ((exact + s - 1n) / s) * s
    if (up > exact) rounded.add(up)
  }
  const next = [...rounded].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, 3)
  return [exact, ...next].map(fromCents)
}

/** 0–1 share of the total already held, for the progress bar (display only). */
export function paidFraction(bill: Pick<Bill, 'paid_total' | 'refunded_total' | 'total'>): number {
  const total = toCents(bill.total)
  if (total <= 0n) return 0
  const paid = toCents(bill.paid_total) - toCents(bill.refunded_total)
  const f = Number((paid * 10_000n) / total) / 10_000
  return Math.min(1, Math.max(0, f))
}

/** The Bills list filters (Android BillsFilter). */
export const BILL_FILTERS = ['open', 'paid', 'void'] as const
export type BillFilter = (typeof BILL_FILTERS)[number]

export const FILTER_LABEL: Record<BillFilter, string> = { open: 'Open', paid: 'Paid today', void: 'Void' }
export const FILTER_STATUSES: Record<BillFilter, readonly BillStatus[]> = {
  open: ['OPEN'],
  paid: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  void: ['VOID'],
}

function zoneOffsetMs(zone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(instant / 1000) * 1000
}

/**
 * Local midnight today in the restaurant's time zone, as an ISO instant — the `paid_since`
 * of "Paid today". Correct across DST changes (the offset is re-read at the candidate).
 */
export function localMidnightIso(zone: string, now: number): string {
  const [y = 1970, m = 1, d = 1] = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now))
    .split('-')
    .map(Number)
  const wall = Date.UTC(y, m - 1, d)
  let instant = wall - zoneOffsetMs(zone, wall)
  instant = wall - zoneOffsetMs(zone, instant)
  return new Date(instant).toISOString()
}
