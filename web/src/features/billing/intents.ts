import type { ApiError } from '@/api/errors'
import type { Bill } from '@/api/types'

/**
 * True when the server definitively refused, so replaying the same key could only fail
 * again. Anything else (offline, timeout, a 5xx) may have landed, so the key is kept.
 */
export function refused(error: ApiError): boolean {
  return ['stale', 'invalid-state', 'validation', 'conflict', 'forbidden', 'not-found'].includes(error.kind)
}

/**
 * The fingerprints carry the bill version the person decided against, so the same charge
 * retried against the same bill reuses its key, while anything decided on a newer bill is a
 * new intent with a new key (and an old version, sent again, is refused as stale).
 */
export const payFingerprint = (billId: number, version: number, c: { methodId: number; amount: string; tendered: string | null; reference: string | null }) =>
  ['pay', billId, version, c.methodId, c.amount, c.tendered ?? '', c.reference ?? ''].join('|')

export const refundFingerprint = (billId: number, version: number, methodId: number, amount: string, reason: string) =>
  ['refund', billId, version, methodId, amount, reason].join('|')

/** What to tell the person when the bill they had open for payment changed under them. */
export function billChangedMessage(bill: Pick<Bill, 'status'>, ownPaymentMayHaveLanded: boolean): string {
  if (bill.status === 'VOID') return 'This bill was voided'
  if (bill.status !== 'OPEN') return ownPaymentMayHaveLanded ? 'A payment was recorded and this bill is now paid' : 'This bill was paid elsewhere'
  return ownPaymentMayHaveLanded ? 'A payment was recorded. Check the balance before charging again.' : 'This bill changed — check it before charging'
}
