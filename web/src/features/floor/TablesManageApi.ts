import { request } from '@/api/client'
import type { components } from '@/api/schema'
import type { Area, DiningTable } from '@/api/types'

type S = components['schemas']
export type TableIn = S['TableIn']
export type TableUpdate = S['TableUpdate']
export type AreaIn = S['AreaIn']
export type AreaUpdate = S['AreaUpdate']

export const tablesApi = {
  createTable: (body: TableIn) => request<DiningTable>('/tables', { method: 'POST', body }),
  updateTable: (id: number, body: TableUpdate) => request<DiningTable>(`/tables/${id}`, { method: 'PATCH', body }),
  deleteTable: (id: number) => request<undefined>(`/tables/${id}`, { method: 'DELETE' }),
  createArea: (body: AreaIn) => request<Area>('/table-areas', { method: 'POST', body }),
  updateArea: (id: number, body: AreaUpdate) => request<Area>(`/table-areas/${id}`, { method: 'PATCH', body }),
  deleteArea: (id: number) => request<undefined>(`/table-areas/${id}`, { method: 'DELETE' }),
}

export interface TableFormValues {
  name: string
  capacity: number
  /** "" = no area. */
  areaId: string
  sortOrder: string
}

export function tableDefaults(table: DiningTable | null, areaId: number | null): TableFormValues {
  return {
    name: table?.name ?? '',
    capacity: table?.capacity ?? 4,
    areaId: String(table ? (table.area_id ?? '') : (areaId ?? '')),
    sortOrder: String(table?.sort_order ?? 0),
  }
}

export function createTableBody(v: TableFormValues): TableIn {
  return {
    name: v.name.trim(),
    capacity: v.capacity,
    area_id: v.areaId ? Number(v.areaId) : null,
    sort_order: Number(v.sortOrder),
  }
}

/**
 * Only changed fields plus the version. Moving a table out of every area needs
 * `clear_area: true` — the server treats `area_id: null` as "no change".
 */
export function updateTableBody(t: DiningTable, v: TableFormValues): TableUpdate {
  const body: TableUpdate = { version: t.version, clear_area: false }
  const name = v.name.trim()
  if (name !== t.name) body.name = name
  if (v.capacity !== t.capacity) body.capacity = v.capacity
  const areaId = v.areaId ? Number(v.areaId) : null
  if (areaId !== t.area_id) {
    if (areaId === null) body.clear_area = true
    else body.area_id = areaId
  }
  const sort = Number(v.sortOrder)
  if (sort !== t.sort_order) body.sort_order = sort
  return body
}

export function tableBodyChanged(body: TableUpdate): boolean {
  return body.clear_area || Object.keys(body).some((k) => k !== 'version' && k !== 'clear_area')
}

export interface AreaGroup {
  area: Area | null
  tables: DiningTable[]
}

/** Tables grouped by area in area order, then the tables with no area. Empty areas are kept. */
export function groupByArea(areas: readonly Area[], tables: readonly DiningTable[]): AreaGroup[] {
  const byTable = (a: DiningTable, b: DiningTable) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, undefined, { numeric: true })
  const sortedAreas = [...areas].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const known = new Set(sortedAreas.map((a) => a.id))
  const groups: AreaGroup[] = sortedAreas.map((area) => ({ area, tables: tables.filter((t) => t.area_id === area.id).sort(byTable) }))
  const loose = tables.filter((t) => t.area_id === null || !known.has(t.area_id)).sort(byTable)
  if (loose.length) groups.push({ area: null, tables: loose })
  return groups
}
