import { request } from '@/api/client'
import type { components } from '@/api/schema'
import type { Bill, DiscountType } from '@/api/types'

type S = components['schemas']

/** Every money call sends the bill version it was decided against. */
export function pay(billId: number, key: string, body: S['PaymentIn']): Promise<Bill> {
  return request<Bill>(`/bills/${billId}/payments`, { method: 'POST', body, idempotencyKey: key })
}

export function refund(billId: number, key: string, body: S['RefundIn']): Promise<Bill> {
  return request<Bill>(`/bills/${billId}/refunds`, { method: 'POST', body, idempotencyKey: key })
}

export function settle(bill: Pick<Bill, 'id' | 'version'>): Promise<Bill> {
  const body: S['VersionIn'] = { version: bill.version }
  return request<Bill>(`/bills/${bill.id}/settle`, { method: 'POST', body })
}

export function setDiscount(bill: Pick<Bill, 'id' | 'version'>, type: DiscountType, value: string, reason: string): Promise<Bill> {
  const body: S['DiscountIn'] = { version: bill.version, type, value, reason }
  return request<Bill>(`/bills/${bill.id}/discount`, { method: 'POST', body })
}

export function removeDiscount(bill: Pick<Bill, 'id' | 'version'>): Promise<Bill> {
  const body: S['DiscountIn'] = { version: bill.version, type: null }
  return request<Bill>(`/bills/${bill.id}/discount`, { method: 'POST', body })
}

export function voidBill(bill: Pick<Bill, 'id' | 'version'>, reason: string): Promise<Bill> {
  const body: S['VoidBillIn'] = { version: bill.version, reason }
  return request<Bill>(`/bills/${bill.id}/void`, { method: 'POST', body })
}
