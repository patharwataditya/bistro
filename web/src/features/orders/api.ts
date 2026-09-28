/** Order-screen calls. Every mutation returns the server's view; nothing is assumed locally. */
import { useQuery } from '@tanstack/react-query'
import { request } from '@/api/client'
import type { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { Bill, Floor, Order } from '@/api/types'
import type { CartLine } from './orderModel'
import { cartPayload } from './orderModel'

const base = (id: number) => `/orders/${id}`

export const orderApi = {
  addItems: (orderId: number, cart: readonly CartLine[], key: string) =>
    request<Order>(`${base(orderId)}/items`, { method: 'POST', body: { items: cartPayload(cart) }, idempotencyKey: key }),
  fire: (orderId: number, version: number, key: string) =>
    request<Order>(`${base(orderId)}/fire`, { method: 'POST', body: { version }, idempotencyKey: key }),
  updateItem: (orderId: number, itemId: number, patch: { quantity?: number; notes?: string }) =>
    request<Order>(`${base(orderId)}/items/${itemId}`, { method: 'PATCH', body: patch }),
  removeItem: (orderId: number, itemId: number) => request<Order>(`${base(orderId)}/items/${itemId}`, { method: 'DELETE' }),
  serveItem: (orderId: number, itemId: number) => request<Order>(`${base(orderId)}/items/${itemId}/serve`, { method: 'POST' }),
  voidItem: (orderId: number, itemId: number, reason: string) =>
    request<Order>(`${base(orderId)}/items/${itemId}/void`, { method: 'POST', body: { reason } }),
  update: (orderId: number, version: number, guests: number) =>
    request<Order>(base(orderId), { method: 'PATCH', body: { version, guest_count: guests } }),
  cancel: (orderId: number, version: number, reason: string) =>
    request<Order>(`${base(orderId)}/cancel`, { method: 'POST', body: { version, reason } }),
  transfer: (orderId: number, version: number, tableId: number) =>
    request<Order>(`${base(orderId)}/transfer`, { method: 'POST', body: { version, table_id: tableId } }),
  merge: (orderId: number, version: number, sourceId: number, sourceVersion: number) =>
    request<Order>(`${base(orderId)}/merge`, { method: 'POST', body: { version, source_order_id: sourceId, source_version: sourceVersion } }),
  split: (orderId: number, version: number, tableId: number, itemIds: number[], guests: number) =>
    request<Order>(`${base(orderId)}/split`, { method: 'POST', body: { version, table_id: tableId, item_ids: itemIds, guest_count: guests } }),
  createBill: (orderId: number, version: number, key: string) =>
    request<Bill>('/bills', { method: 'POST', body: { order_id: orderId, order_version: version }, idempotencyKey: key }),
}

/** The floor, read only while a table picker is open (shares the floor cache). */
export function usePickerFloor(enabled: boolean) {
  return useQuery<Floor, ApiError>({
    queryKey: keys.floor,
    queryFn: ({ signal }) => request<Floor>('/tables', { signal }),
    enabled,
    staleTime: 0,
  })
}
