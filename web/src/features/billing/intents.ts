import type { ApiError } from '@/api/errors'
import type { Bill } from '@/api/types'

/**
 * True when the server definitively refused, so replaying the same key could only fail
 * again. Anything else (offline, timeout, a 5xx) may have landed, so the key is kept.
 */
export function refused(error: ApiError): boolean {
  return ['stale', 'invalid-state', 'validation', 'conflict', 'forbidden', 'not-found'].includes(error.kind)
}

export const payFingerprint = (bill: Pick<Bill, 'id' | 'version'>, c: { methodId: number; amount: string; tendered: string | null; reference: string | null }) =>
  [bill.id, bill.version, c.methodId, c.amount, c.tendered ?? '', c.reference ?? ''].join('|')

export const refundFingerprint = (bill: Pick<Bill, 'id' | 'version'>, methodId: number, amount: string, reason: string) =>
  [bill.id, bill.version, methodId, amount, reason].join('|')
