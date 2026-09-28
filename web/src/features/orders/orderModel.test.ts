import type { DiningTable, MenuCategory, MenuItem, Order, OrderItem } from '@/api/types'
import { P, type Permission } from '@/auth/permissions'
import {
  abilities, addToCart, anythingFired, appendNote, canVoidItem, cartCount, cartFingerprint, cartPayload, cartQuantityOf,
  cartTotal, filterMenu, groupItems, lineKey, lineTotal, pendingUnits, pickCandidates, setCartLine, sortMenuItems,
  splitProblem, splittableItems, subtractCart, rebaseDrafts, firedUnits, shouldBlockLeave,
} from './orderModel'
import { newerOrder } from './orderCache'

let seq = 0
function item(status: string, over: Partial<OrderItem> = {}): OrderItem {
  seq += 1
  return {
    id: seq, menu_item_id: 1, name: `Item ${seq}`, unit_price: '100.00', quantity: 1, line_total: '100.00', notes: null,
    status, ticket_id: status === 'PENDING' ? null : 1, void_reason: null, created_at: '2026-01-01T12:00:00Z', ...over,
  }
}

function order(items: OrderItem[], over: Partial<Order> = {}): Order {
  return {
    id: 5, order_number: 12, status: 'OPEN', table_id: 1, table_name: 'T1', server_id: 1, server_name: 'Sofia', guest_count: 2,
    notes: null, opened_at: '2026-01-01T12:00:00Z', billed_at: null, closed_at: null, cancelled_at: null, cancel_reason: null,
    merged_into_id: null, items, bill_id: null, currency_code: 'INR', version: 4,
    totals: { subtotal: '0', discount_amount: '0', service_charge_percent: '0', service_charge_amount: '0', taxes: [], tax_total: '0', round_off: '0', total: '0' },
    ...over,
  }
}

const grants = (...codes: Permission[]) => (p: Permission) => codes.includes(p)

describe('sections', () => {
  it('groups in Android order and counts units (with typed quantities)', () => {
    const pending = item('PENDING', { quantity: 2 })
    const items = [item('SERVED'), item('VOIDED'), pending, item('SENT'), item('PREPARING', { quantity: 3 }), item('READY')]
    const groups = groupItems(items, new Map([[pending.id, 5]]))
    expect(groups.map((g) => g.title)).toEqual(['Not sent yet', 'Ready to serve', 'In the kitchen', 'Served', 'Voided'])
    expect(groups[0]?.quantity).toBe(5)
    expect(groups[2]?.quantity).toBe(4)
    expect(pendingUnits(items, new Map([[pending.id, 5]]))).toBe(5)
  })

  it('omits empty sections', () => {
    expect(groupItems([item('READY')]).map((g) => g.title)).toEqual(['Ready to serve'])
  })
})

describe('split eligibility', () => {
  it('allows pending items and served items whose whole ticket is finished', () => {
    const done = item('SERVED', { ticket_id: 7 })
    const doneVoid = item('VOIDED', { ticket_id: 7 })
    const busyServed = item('SERVED', { ticket_id: 8 })
    const busyCooking = item('PREPARING', { ticket_id: 8 })
    const pending = item('PENDING')
    const ids = splittableItems([done, doneVoid, busyServed, busyCooking, pending]).map((i) => i.id)
    expect(ids).toEqual([done.id, pending.id])
  })

  it('must move something and leave a live item behind', () => {
    const a = item('PENDING')
    const b = item('SERVED')
    const v = item('VOIDED')
    expect(splitProblem(new Set(), [a, b, v])).toBe('none-selected')
    expect(splitProblem(new Set([a.id, b.id]), [a, b, v])).toBe('everything')
    expect(splitProblem(new Set([a.id]), [a, b, v])).toBeNull()
  })
})

describe('abilities', () => {
  it('lets a server without orders.cancel cancel only an unfired order', () => {
    const can = grants(P.ORDERS_UPDATE)
    expect(abilities(order([item('PENDING')]), can).cancel).toBe(true)
    expect(abilities(order([item('PENDING'), item('SENT')]), can).cancel).toBe(false)
    expect(abilities(order([item('SENT')]), grants(P.ORDERS_UPDATE, P.ORDERS_CANCEL)).cancel).toBe(true)
    expect(anythingFired([item('PENDING'), item('VOIDED')])).toBe(false)
  })

  it('allows move and guests on billed orders but merge/split/edit only when open', () => {
    const a = abilities(order([item('SERVED')], { status: 'BILLED', bill_id: 3 }), grants(P.ORDERS_UPDATE, P.ORDERS_TRANSFER, P.BILLING_VIEW))
    expect(a).toMatchObject({ move: true, changeGuests: true, merge: false, split: false, edit: false, cancel: false, viewBill: true })
    const closed = abilities(order([], { status: 'CLOSED' }), grants(P.ORDERS_UPDATE, P.ORDERS_TRANSFER))
    expect(closed).toMatchObject({ move: false, changeGuests: false })
  })

  it('needs tables.view to pick a table for move, merge or split', () => {
    expect(abilities(order([]), grants(P.ORDERS_TRANSFER)).seeTables).toBe(false)
    expect(abilities(order([]), grants(P.ORDERS_TRANSFER, P.TABLES_VIEW)).seeTables).toBe(true)
  })

  it('voids only sent lines, only with orders.cancel, only while open', () => {
    const a = abilities(order([]), grants(P.ORDERS_CANCEL))
    expect(canVoidItem(item('SENT'), a)).toBe(true)
    expect(canVoidItem(item('PENDING'), a)).toBe(false)
    expect(canVoidItem(item('VOIDED'), a)).toBe(false)
    expect(canVoidItem(item('SENT'), abilities(order([], { status: 'BILLED' }), grants(P.ORDERS_CANCEL)))).toBe(false)
  })
})

describe('table picker', () => {
  const t = (id: number, status: string, open?: 'OPEN' | 'BILLED'): DiningTable => ({
    id, name: `T${id}`, capacity: 4, area_id: null, area_name: null, status, status_note: null, sort_order: 0, version: 1,
    active_order: open ? { id: id * 10, order_number: id, status: open, guest_count: 2, opened_at: '', server_name: '', item_count: 1, pending_count: 0, ready_count: 0, subtotal: '1.00', bill_id: null, version: 1 } : null,
  })
  const tables = [t(1, 'OCCUPIED', 'OPEN'), t(2, 'AVAILABLE'), t(3, 'CLEANING'), t(4, 'BLOCKED'), t(5, 'OCCUPIED', 'OPEN'), t(6, 'OCCUPIED', 'BILLED')]
  it('moves to free seatable tables and merges open checks only', () => {
    expect(pickCandidates(tables, order([]), 'move').map((x) => x.id)).toEqual([2, 3])
    expect(pickCandidates(tables, order([]), 'merge').map((x) => x.id)).toEqual([5])
  })
})

describe('cart', () => {
  const soup = { id: 1, name: 'Soup', price: '180.00', is_available: true }
  it('merges lines by item + note and caps quantities at 999', () => {
    let cart = addToCart([], soup)
    cart = addToCart(cart, soup, 2)
    cart = addToCart(cart, soup, 1, '  Mild ')
    expect(cart).toHaveLength(2)
    expect(cart[0]?.quantity).toBe(3)
    expect(cart[1]?.note).toBe('Mild')
    expect(cartCount(cart)).toBe(4)
    expect(cartQuantityOf(cart, 1)).toBe(4)
    expect(addToCart(cart, soup, 5000)[0]?.quantity).toBe(999)
  })

  it('never adds sold-out items', () => {
    expect(addToCart([], { ...soup, is_available: false })).toEqual([])
  })

  it('removes a line at zero', () => {
    const cart = addToCart(addToCart([], soup), soup, 1, 'Mild')
    expect(setCartLine(cart, lineKey(1, 'Mild'), 0)).toHaveLength(1)
    expect(setCartLine(cart, lineKey(1, ''), 7)[0]?.quantity).toBe(7)
  })

  it('fingerprints the exact intent', () => {
    const a = addToCart([], soup)
    expect(cartFingerprint(5, a)).toBe(cartFingerprint(5, addToCart([], soup)))
    expect(cartFingerprint(5, addToCart(a, soup))).not.toBe(cartFingerprint(5, a))
    expect(cartPayload(addToCart(a, soup, 1, 'x'))).toEqual([
      { menu_item_id: 1, quantity: 1, notes: null },
      { menu_item_id: 1, quantity: 1, notes: 'x' },
    ])
  })

  it('estimates with exact decimals', () => {
    expect(lineTotal('0.10', 3)).toBe('0.30')
    expect(lineTotal('19.99', 999)).toBe('19970.01')
    expect(cartTotal([{ menuItemId: 1, name: 'a', price: '0.1', quantity: 3, note: '' }, { menuItemId: 2, name: 'b', price: '0.20', quantity: 1, note: '' }])).toBe('0.50')
  })
})

describe('menu', () => {
  const cats: MenuCategory[] = [{ id: 2, name: 'Starters', sort_order: 0, item_count: 0 }, { id: 1, name: 'Mains', sort_order: 1, item_count: 0 }]
  const mi = (id: number, category_id: number, name: string, sort_order = 0, description: string | null = null): MenuItem =>
    ({ id, category_id, name, description, price: '1.00', is_available: true, sort_order, version: 1 })
  const items = [mi(1, 1, 'Curry'), mi(2, 2, 'Soup', 1), mi(3, 2, 'Bread', 0, 'Garlic naan'), mi(4, 1, 'Biryani')]
  it('sorts by category order, then sort order, then name', () => {
    expect(sortMenuItems(items, cats).map((i) => i.id)).toEqual([3, 2, 4, 1])
  })
  it('searches names and descriptions within a category', () => {
    expect(filterMenu(items, null, 'GARLIC').map((i) => i.id)).toEqual([3])
    expect(filterMenu(items, 1, 'r').map((i) => i.id)).toEqual([1, 4])
  })
  it('appends quick notes', () => {
    expect(appendNote('', 'Mild')).toBe('Mild')
    expect(appendNote('No onions', 'Mild')).toBe('No onions, Mild')
  })
})

describe('after an add', () => {
  const dish = (id: number) => ({ id, name: `Dish ${id}`, price: '10.00', is_available: true })

  it('takes off only what was submitted, keeping taps made while it was in flight', () => {
    const submitted = addToCart(addToCart([], dish(1), 2), dish(2), 1)
    // While the request was in flight: one more of dish 1, a new dish 3, and dish 2 with a note.
    let now = addToCart(submitted, dish(1), 1)
    now = addToCart(now, dish(3), 2)
    now = addToCart(now, dish(2), 1, 'No ice')
    const left = subtractCart(now, submitted)
    expect(left.map((l) => [l.menuItemId, l.quantity, l.note])).toEqual([[1, 1, ''], [3, 2, ''], [2, 1, 'No ice']])
    expect(subtractCart(submitted, submitted)).toEqual([])
    // Lowered below what was sent while in flight: the line just goes.
    expect(subtractCart(setCartLine(submitted, lineKey(1, ''), 1), submitted).some((l) => l.menuItemId === 1)).toBe(false)
  })

  it('moves a typed quantity by what the server merged into that line', () => {
    const a = item('PENDING', { quantity: 2 })
    const b = item('PENDING', { quantity: 1 })
    const before = order([a, b], { version: 4 })
    const after = order([{ ...a, quantity: 3 }, { ...b, status: 'SENT' }], { version: 5 })
    const next = rebaseDrafts(new Map([[a.id, 5], [b.id, 4]]), before, after)
    expect(next.get(a.id)).toBe(6)
    expect(next.has(b.id)).toBe(false)
  })

  it('counts what a send actually fired', () => {
    const before = order([item('PENDING', { quantity: 3 }), item('PENDING', { quantity: 1 }), item('SENT', { quantity: 2 })])
    const after = order(before.items.map((i) => ({ ...i, status: 'SENT' })))
    expect(firedUnits(before, after)).toBe(4)
  })
})

describe('late answers', () => {
  it('keeps the newer check', () => {
    const cached = order([], { version: 7 })
    expect(newerOrder(cached, order([], { version: 6 }))).toBe(cached)
    const incoming = order([], { version: 8 })
    expect(newerOrder(cached, incoming)).toBe(incoming)
    expect(newerOrder(undefined, incoming)).toBe(incoming)
  })
})

describe('leaving with new items', () => {
  const base = { cartUnits: 2, editable: true, leaving: false, samePath: false }
  it('asks only while the items could still be added', () => {
    expect(shouldBlockLeave(base)).toBe(true)
    expect(shouldBlockLeave({ ...base, cartUnits: 0 })).toBe(false)
    // Cancelled, split away, merged: the check can't take them any more.
    expect(shouldBlockLeave({ ...base, editable: false })).toBe(false)
    // The screen navigates itself after a successful action.
    expect(shouldBlockLeave({ ...base, leaving: true })).toBe(false)
    expect(shouldBlockLeave({ ...base, samePath: true })).toBe(false)
  })
})
