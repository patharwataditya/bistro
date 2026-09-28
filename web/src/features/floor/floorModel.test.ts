import type { ActiveOrderBrief, Area, DiningTable } from '@/api/types'
import {
  ALL_AREAS, areaFromKey, areaKey, areaOptions, defaultGuests, filterTables, freeSummary, groupTables, isSeatable,
  seatFingerprint, statusCounts, tableChip, tableDescription, tableFlag,
} from './floorModel'

const areas: Area[] = [
  { id: 2, name: 'Patio', sort_order: 1 },
  { id: 1, name: 'Main Hall', sort_order: 0 },
]

function brief(over: Partial<ActiveOrderBrief> = {}): ActiveOrderBrief {
  return {
    id: 9, order_number: 12, status: 'OPEN', guest_count: 3, opened_at: '2026-01-01T12:00:00Z', server_name: 'Sofia',
    item_count: 4, pending_count: 0, ready_count: 0, subtotal: '470.00', bill_id: null, version: 3, ...over,
  }
}

function table(over: Partial<DiningTable> = {}): DiningTable {
  return {
    id: 1, name: 'T1', capacity: 4, area_id: 1, area_name: 'Main Hall', status: 'AVAILABLE', status_note: null,
    sort_order: 0, version: 1, active_order: null, ...over,
  }
}

const now = new Date('2026-01-01T12:47:30Z').getTime()

describe('table card', () => {
  it('flags ready food before unsent items', () => {
    expect(tableFlag(brief({ ready_count: 2, pending_count: 5 }))).toEqual({ text: '2 ready', tone: 'success' })
    expect(tableFlag(brief({ pending_count: 5 }))).toEqual({ text: '5 unsent', tone: 'warning' })
    expect(tableFlag(brief())).toBeNull()
    expect(tableFlag(null)).toBeNull()
  })

  it('shows "Bill issued" for a billed order, otherwise the table status', () => {
    expect(tableChip(table({ status: 'OCCUPIED', active_order: brief({ status: 'BILLED' }) })).label).toBe('Bill issued')
    expect(tableChip(table({ status: 'OCCUPIED', active_order: brief() })).label).toBe('Occupied')
    expect(tableChip(table({ status: 'CLEANING' })).tone).toBe('cleaning')
  })

  it('describes the whole card for screen readers', () => {
    const t = table({ status: 'OCCUPIED', active_order: brief({ ready_count: 1, pending_count: 2 }) })
    const d = tableDescription(t, now, 'INR')
    expect(d).toMatch(/^Table T1, 4 seats, Occupied, order 12, 3 guests, seated 47m, /)
    expect(d).toMatch(/1 ready to serve, 2 not sent$/)
    expect(tableDescription(table({ status: 'RESERVED', status_note: 'Rao, 9pm' }), now, 'INR')).toBe('Table T1, 4 seats, Reserved, Rao, 9pm')
  })
})

describe('floor filters', () => {
  const tables = [
    table({ id: 1, area_id: 1 }),
    table({ id: 2, area_id: 2, status: 'OCCUPIED' }),
    table({ id: 3, area_id: null, area_name: null, status: 'BLOCKED' }),
    table({ id: 4, area_id: 1, status: 'OCCUPIED' }),
  ]

  it('offers Unassigned only when some table has no area', () => {
    expect(areaOptions(areas, tables).map(areaKey)).toEqual(['all', '2', '1', 'none'])
    expect(areaOptions(areas, tables.slice(0, 2)).map(areaKey)).toEqual(['all', '2', '1'])
  })

  it('resolves URL keys and falls back to every table', () => {
    const opts = areaOptions(areas, tables)
    expect(areaFromKey('none', opts)).toEqual({ kind: 'one', id: null, name: 'Unassigned' })
    expect(areaFromKey('99', opts)).toBe(ALL_AREAS)
  })

  it('filters by area and status together', () => {
    expect(filterTables(tables, { kind: 'one', id: 1, name: 'Main Hall' }, 'OCCUPIED').map((t) => t.id)).toEqual([4])
    expect(filterTables(tables, { kind: 'one', id: null, name: 'Unassigned' }, null).map((t) => t.id)).toEqual([3])
  })

  it('groups by area sort order with unassigned last', () => {
    const groups = groupTables(tables, areas, ALL_AREAS)
    expect(groups.map((g) => g.title)).toEqual(['Main Hall', 'Patio', 'Unassigned'])
    expect(groups[0]?.tables.map((t) => t.id)).toEqual([1, 4])
    expect(groupTables(tables, areas, { kind: 'one', id: 2, name: 'Patio' })).toHaveLength(1)
  })

  it('counts statuses and free tables', () => {
    expect(statusCounts(tables)).toEqual({ AVAILABLE: 1, OCCUPIED: 2, RESERVED: 0, CLEANING: 0, BLOCKED: 1 })
    expect(freeSummary(tables)).toBe('1 of 4 tables free')
  })
})

describe('seating', () => {
  it('seats at available, reserved and cleaning tables only', () => {
    expect(['AVAILABLE', 'RESERVED', 'CLEANING'].every(isSeatable)).toBe(true)
    expect(isSeatable('BLOCKED') || isSeatable('OCCUPIED')).toBe(false)
  })

  it('defaults to two guests, fewer for a smaller table', () => {
    expect(defaultGuests(6)).toBe(2)
    expect(defaultGuests(1)).toBe(1)
  })

  it('makes a new intent when the table version or party size changes', () => {
    const t = table()
    expect(seatFingerprint(t, 2)).toBe(seatFingerprint(t, 2))
    expect(seatFingerprint(t, 3)).not.toBe(seatFingerprint(t, 2))
    expect(seatFingerprint({ ...t, version: 2 }, 2)).not.toBe(seatFingerprint(t, 2))
  })
})
