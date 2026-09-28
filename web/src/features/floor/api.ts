import { request } from '@/api/client'
import type { DiningTable, Order } from '@/api/types'
import type { ManualStatus } from './floorModel'

export const floorApi = {
  /** Seat guests: opens an order on the table. One idempotency key per seat intent. */
  seat: (tableId: number, guests: number, key: string) =>
    request<Order>('/orders', { method: 'POST', body: { table_id: tableId, guest_count: guests, items: [] }, idempotencyKey: key }),
  setStatus: (table: DiningTable, status: ManualStatus, note: string | null) =>
    request<DiningTable>(`/tables/${table.id}/status`, { method: 'POST', body: { version: table.version, status, note } }),
}
