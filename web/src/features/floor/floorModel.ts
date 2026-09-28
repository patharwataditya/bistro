/**
 * Pure floor logic (Android FloorScreen / TableCard / FloorViewModel), kept apart from the
 * components so it can be tested without a DOM.
 */
import type { ActiveOrderBrief, Area, DiningTable, TableStatus } from '@/api/types'
import { elapsed, money } from '@/lib/format'
import { orderVisual, tableVisual, type StatusVisual } from '@/ui/status'
import type { Tone } from '@/ui/tone'

/** Statuses in the summary row, in Android's order. */
export const SUMMARY_STATUSES: readonly TableStatus[] = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'BLOCKED']

/** Statuses a person can set by hand (never to or from Occupied). */
export const MANUAL_STATUSES = ['AVAILABLE', 'RESERVED', 'CLEANING', 'BLOCKED'] as const
export type ManualStatus = (typeof MANUAL_STATUSES)[number]

export function isManualStatus(s: string): s is ManualStatus {
  return (MANUAL_STATUSES as readonly string[]).includes(s)
}

/** A table guests can be seated at (the server's rule). */
export function isSeatable(status: string): boolean {
  return status === 'AVAILABLE' || status === 'RESERVED' || status === 'CLEANING'
}

/** Area filter: every table, one area, or tables without an area (`id: null`). */
export type AreaFilter = { kind: 'all' } | { kind: 'one'; id: number | null; name: string }
export const ALL_AREAS: AreaFilter = { kind: 'all' }

export function areaKey(f: AreaFilter): string {
  return f.kind === 'all' ? 'all' : f.id === null ? 'none' : String(f.id)
}

export function areaOptions(areas: readonly Area[], tables: readonly DiningTable[]): AreaFilter[] {
  const out: AreaFilter[] = [ALL_AREAS, ...areas.map((a): AreaFilter => ({ kind: 'one', id: a.id, name: a.name }))]
  if (tables.some((t) => t.area_id === null)) out.push({ kind: 'one', id: null, name: 'Unassigned' })
  return out
}

/** Resolve a filter from its URL key; unknown keys fall back to every table. */
export function areaFromKey(key: string | null, options: readonly AreaFilter[]): AreaFilter {
  return options.find((o) => areaKey(o) === key) ?? ALL_AREAS
}

export function filterTables(tables: readonly DiningTable[], area: AreaFilter, status: TableStatus | null): DiningTable[] {
  return tables.filter((t) => (area.kind === 'all' || area.id === t.area_id) && (status === null || t.status === status))
}

export interface TableGroup {
  key: string
  title: string | null
  tables: DiningTable[]
}

/**
 * In the "All areas" view the grid reads like the room: grouped by area in the area's sort
 * order, tables without an area last. Keys use the area id; names aren't unique keys.
 */
export function groupTables(visible: readonly DiningTable[], areas: readonly Area[], area: AreaFilter): TableGroup[] {
  if (area.kind !== 'all') return [{ key: 'area-filtered', title: null, tables: [...visible] }]
  const order = new Map(areas.map((a) => [a.id, a.sort_order]))
  const names = new Map(areas.map((a) => [a.id, a.name]))
  const groups = new Map<number | null, DiningTable[]>()
  for (const t of visible) {
    const list = groups.get(t.area_id)
    if (list) list.push(t)
    else groups.set(t.area_id, [t])
  }
  const rank = (id: number | null) => (id === null ? Number.MAX_SAFE_INTEGER : (order.get(id) ?? Number.MAX_SAFE_INTEGER - 1))
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([id, tables]) => ({ key: `area-${id ?? 'none'}`, title: (id !== null ? names.get(id) : undefined) ?? 'Unassigned', tables }))
}

export function statusCounts(tables: readonly DiningTable[]): Record<TableStatus, number> {
  const out: Record<TableStatus, number> = { AVAILABLE: 0, OCCUPIED: 0, RESERVED: 0, CLEANING: 0, BLOCKED: 0 }
  for (const t of tables) if (t.status in out) out[t.status as TableStatus] += 1
  return out
}

/** "N of M tables free" counts Available tables only, like Android. */
export function freeSummary(tables: readonly DiningTable[]): string {
  const free = tables.filter((t) => t.status === 'AVAILABLE').length
  return `${free} of ${tables.length} tables free`
}

/** The chip a card shows: "Bill issued" for a billed order (informational, not occupied). */
export function tableChip(table: DiningTable): StatusVisual {
  if (table.active_order?.status === 'BILLED') return orderVisual('BILLED')
  return tableVisual(table.status)
}

/** One flag, the most urgent: food waiting beats items not yet sent. */
export function tableFlag(order: ActiveOrderBrief | null | undefined): { text: string; tone: Tone } | null {
  if (!order) return null
  if (order.ready_count > 0) return { text: `${order.ready_count} ready`, tone: 'success' }
  if (order.pending_count > 0) return { text: `${order.pending_count} unsent`, tone: 'warning' }
  return null
}

export function guestsLabel(n: number): string {
  return `${n} ${n === 1 ? 'guest' : 'guests'}`
}

/** "#12 · 3 guests · 47m" */
export function orderLine(order: ActiveOrderBrief, now: number): string {
  return `#${order.order_number} · ${guestsLabel(order.guest_count)} · ${elapsed(order.opened_at, now)}`
}

/** Everything the card shows, as one sentence for screen readers (Android's contentDescription). */
export function tableDescription(table: DiningTable, now: number, currency: string): string {
  const chip = tableChip(table)
  const parts = [`Table ${table.name}`, `${table.capacity} seats`, chip.label]
  if (table.status_note) parts.push(table.status_note)
  const order = table.active_order
  if (order) {
    parts.push(`order ${order.order_number}`, guestsLabel(order.guest_count), `seated ${elapsed(order.opened_at, now)}`)
    parts.push(money(order.subtotal, currency))
    if (order.ready_count > 0) parts.push(`${order.ready_count} ready to serve`)
    if (order.pending_count > 0) parts.push(`${order.pending_count} not sent`)
  }
  return parts.join(', ')
}

/** Default party size for the seat form: two, or fewer for a smaller table. */
export function defaultGuests(capacity: number): number {
  return Math.max(1, Math.min(capacity, 2))
}

export function seatFingerprint(table: DiningTable, guests: number): string {
  return `seat:${table.id}:${table.version}:${guests}`
}
