import type { Area, DiningTable } from '@/api/types'
import { createTableBody, groupByArea, tableBodyChanged, tableDefaults, updateTableBody } from './TablesManageApi'
import { tableSchema } from './TablesManageDrawer'

const t = (id: number, name: string, area_id: number | null, sort_order = 0): DiningTable => ({
  id, name, capacity: 4, area_id, area_name: null, status: 'AVAILABLE', status_note: null, sort_order, version: 3, active_order: null,
})
const areas: Area[] = [{ id: 2, name: 'Terrace', sort_order: 1 }, { id: 1, name: 'Hall', sort_order: 0 }, { id: 3, name: 'Bar', sort_order: 2 }]

describe('groupByArea', () => {
  it('orders areas, sorts tables naturally, and puts unassigned last', () => {
    const groups = groupByArea(areas, [t(1, 'T10', 1), t(2, 'T2', 1), t(3, 'P1', 2), t(4, 'Loose', null), t(5, 'Orphan', 99)])
    expect(groups.map((g) => g.area?.name ?? null)).toEqual(['Hall', 'Terrace', 'Bar', null])
    expect(groups[0]?.tables.map((x) => x.name)).toEqual(['T2', 'T10'])
    expect(groups[2]?.tables).toEqual([])
    expect(groups[3]?.tables.map((x) => x.name)).toEqual(['Loose', 'Orphan'])
  })
})

describe('table bodies', () => {
  const table = { ...t(8, 'T8', 1, 4), capacity: 6 }
  it('uses clear_area to move a table out of its area', () => {
    const body = updateTableBody(table, { ...tableDefaults(table, null), areaId: '' })
    expect(body).toEqual({ version: 3, clear_area: true })
    expect(tableBodyChanged(body)).toBe(true)
  })
  it('sends only changed fields', () => {
    expect(updateTableBody(table, tableDefaults(table, null))).toEqual({ version: 3, clear_area: false })
    expect(tableBodyChanged(updateTableBody(table, tableDefaults(table, null)))).toBe(false)
    expect(updateTableBody(table, { name: ' T9 ', capacity: 2, areaId: '2', sortOrder: '4' })).toEqual({ version: 3, clear_area: false, name: 'T9', capacity: 2, area_id: 2 })
  })
  it('creates with null area when none is picked', () => {
    expect(createTableBody({ name: 'T1', capacity: 2, areaId: '', sortOrder: '0' })).toEqual({ name: 'T1', capacity: 2, area_id: null, sort_order: 0 })
  })
  it('validates like the server', () => {
    const ok = { name: 'T1', capacity: 4, areaId: '', sortOrder: '0' }
    expect(tableSchema.safeParse(ok).success).toBe(true)
    expect(tableSchema.safeParse({ ...ok, name: 'x'.repeat(21) }).success).toBe(false)
    expect(tableSchema.safeParse({ ...ok, capacity: 51 }).success).toBe(false)
    expect(tableSchema.safeParse({ ...ok, capacity: 0 }).success).toBe(false)
  })
})
