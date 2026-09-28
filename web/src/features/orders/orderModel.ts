/**
 * Pure order logic mirroring Android's OrderScreen / OrderSheets / AddItemsViewModel rules.
 * The server stays the authority; these only decide what to offer.
 */
import type { DiningTable, MenuCategory, MenuItem, Order, OrderItem } from '@/api/types'
import { P, type Permission } from '@/auth/permissions'

// ---------------------------------------------------------------------------------------
// Sections of a check, in the order staff care about them.

export const SECTIONS: readonly { title: string; statuses: readonly string[] }[] = [
  { title: 'Not sent yet', statuses: ['PENDING'] },
  { title: 'Ready to serve', statuses: ['READY'] },
  { title: 'In the kitchen', statuses: ['SENT', 'PREPARING'] },
  { title: 'Served', statuses: ['SERVED'] },
  { title: 'Voided', statuses: ['VOIDED'] },
]

export interface ItemSection {
  title: string
  items: OrderItem[]
  quantity: number
}

export function groupItems(items: readonly OrderItem[], drafts: ReadonlyMap<number, number> = new Map()): ItemSection[] {
  return SECTIONS.map((s) => {
    const list = items.filter((i) => s.statuses.includes(i.status))
    return { title: s.title, items: list, quantity: list.reduce((n, i) => n + (drafts.get(i.id) ?? i.quantity), 0) }
  }).filter((s) => s.items.length > 0)
}

/** Units waiting to be sent, counting quantities typed but not yet confirmed. */
export function pendingUnits(items: readonly OrderItem[], drafts: ReadonlyMap<number, number> = new Map()): number {
  return items.filter((i) => i.status === 'PENDING').reduce((n, i) => n + (drafts.get(i.id) ?? i.quantity), 0)
}

export function hasLiveItems(items: readonly OrderItem[]): boolean {
  return items.some((i) => i.status !== 'VOIDED')
}

/** Something already went to the kitchen (cancelling then needs orders.cancel). */
export function anythingFired(items: readonly OrderItem[]): boolean {
  return items.some((i) => i.status !== 'PENDING' && i.status !== 'VOIDED')
}

export function isActive(status: string): boolean {
  return status === 'OPEN' || status === 'BILLED'
}

// ---------------------------------------------------------------------------------------
// What the person may do (Android gates, PRODUCT_MAP §1/§4).

export interface OrderAbilities {
  edit: boolean
  serve: boolean
  voidItems: boolean
  fire: boolean
  bill: boolean
  viewBill: boolean
  changeGuests: boolean
  move: boolean
  merge: boolean
  split: boolean
  cancel: boolean
}

export function abilities(order: Order, can: (p: Permission) => boolean): OrderAbilities {
  const open = order.status === 'OPEN'
  const active = isActive(order.status)
  const update = can(P.ORDERS_UPDATE)
  const transfer = can(P.ORDERS_TRANSFER)
  return {
    edit: open && update,
    serve: update,
    voidItems: open && can(P.ORDERS_CANCEL),
    fire: open && update,
    bill: open && can(P.BILLING_CREATE),
    viewBill: order.bill_id !== null && can(P.BILLING_VIEW),
    changeGuests: active && update,
    move: active && transfer,
    merge: open && transfer,
    split: open && transfer,
    cancel: open && update && (!anythingFired(order.items) || can(P.ORDERS_CANCEL)),
  }
}

export function canVoidItem(item: OrderItem, a: OrderAbilities): boolean {
  return a.voidItems && item.status !== 'PENDING' && item.status !== 'VOIDED'
}

// ---------------------------------------------------------------------------------------
// Move / merge / split.

export type TablePick = 'move' | 'merge' | 'split'

/**
 * Items that may be split away: never-fired lines, or served lines whose whole kitchen
 * ticket is finished (every line on it served or voided).
 */
export function splittableItems(items: readonly OrderItem[]): OrderItem[] {
  return items.filter((item) => {
    if (item.status === 'PENDING') return true
    if (item.status !== 'SERVED') return false
    return items.filter((o) => o.ticket_id === item.ticket_id).every((o) => o.status === 'SERVED' || o.status === 'VOIDED')
  })
}

export type SplitProblem = 'none-selected' | 'everything' | null

/** The split must move something and leave at least one live item behind. */
export function splitProblem(selection: ReadonlySet<number>, items: readonly OrderItem[]): SplitProblem {
  if (selection.size === 0) return 'none-selected'
  const live = items.filter((i) => i.status !== 'VOIDED').length
  if (selection.size >= live) return 'everything'
  return null
}

export function pickCandidates(tables: readonly DiningTable[], order: Order, pick: TablePick): DiningTable[] {
  return tables.filter((t) => {
    if (t.id === order.table_id) return false
    if (pick === 'merge') return t.active_order?.status === 'OPEN'
    return !t.active_order && (t.status === 'AVAILABLE' || t.status === 'RESERVED' || t.status === 'CLEANING')
  })
}

// ---------------------------------------------------------------------------------------
// Local cart. The same item with a different note is a different line.

export const MAX_QTY = 999

export interface CartLine {
  menuItemId: number
  name: string
  price: string
  quantity: number
  note: string
}

export function lineKey(menuItemId: number, note: string): string {
  return `${menuItemId}|${note.trim()}`
}

export function addToCart(cart: readonly CartLine[], item: Pick<MenuItem, 'id' | 'name' | 'price' | 'is_available'>, quantity = 1, note = ''): CartLine[] {
  if (!item.is_available || quantity <= 0) return [...cart]
  const clean = note.trim()
  const key = lineKey(item.id, clean)
  if (cart.some((l) => lineKey(l.menuItemId, l.note) === key)) {
    return cart.map((l) => (lineKey(l.menuItemId, l.note) === key ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) } : l))
  }
  return [...cart, { menuItemId: item.id, name: item.name, price: item.price, quantity: Math.min(MAX_QTY, quantity), note: clean }]
}

/** Set a line's quantity; zero or less removes it. */
export function setCartLine(cart: readonly CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return cart.filter((l) => lineKey(l.menuItemId, l.note) !== key)
  return cart.map((l) => (lineKey(l.menuItemId, l.note) === key ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l))
}

export function cartCount(cart: readonly CartLine[]): number {
  return cart.reduce((n, l) => n + l.quantity, 0)
}

export function cartQuantityOf(cart: readonly CartLine[], menuItemId: number): number {
  return cart.filter((l) => l.menuItemId === menuItemId).reduce((n, l) => n + l.quantity, 0)
}

/** Identifies one "add these lines" intent: any change to the cart is a new intent. */
export function cartFingerprint(orderId: number, cart: readonly CartLine[]): string {
  return `add:${orderId}:${cart.map((l) => `${l.menuItemId}x${l.quantity}~${l.note}`).join('|')}`
}

export function cartPayload(cart: readonly CartLine[]) {
  return cart.map((l) => ({ menu_item_id: l.menuItemId, quantity: l.quantity, notes: l.note || null }))
}

// ---------------------------------------------------------------------------------------
// Exact decimal arithmetic for the cart *estimate* only (the server prices the check).

function toCents(amount: string): bigint {
  const t = amount.trim()
  const neg = t.startsWith('-')
  const [i = '0', f = ''] = t.replace(/^[-+]/, '').split('.')
  const cents = BigInt(i || '0') * 100n + BigInt((f + '00').slice(0, 2))
  return neg ? -cents : cents
}

function fromCents(cents: bigint): string {
  const neg = cents < 0n
  const abs = neg ? -cents : cents
  const frac = String(abs % 100n).padStart(2, '0')
  return `${neg ? '-' : ''}${abs / 100n}.${frac}`
}

export function lineTotal(price: string, quantity: number): string {
  return fromCents(toCents(price) * BigInt(quantity))
}

export function cartTotal(cart: readonly CartLine[]): string {
  return fromCents(cart.reduce((sum, l) => sum + toCents(l.price) * BigInt(l.quantity), 0n))
}

// ---------------------------------------------------------------------------------------
// Menu browsing: "All" reads like a printed menu, categories in menu order.

export function sortMenuItems(items: readonly MenuItem[], categories: readonly MenuCategory[]): MenuItem[] {
  const rank = new Map(categories.map((c, i) => [c.id, i]))
  return [...items].sort(
    (a, b) =>
      (rank.get(a.category_id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.category_id) ?? Number.MAX_SAFE_INTEGER) ||
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name),
  )
}

export function filterMenu(items: readonly MenuItem[], category: number | null, query: string): MenuItem[] {
  const q = query.trim().toLowerCase()
  return items.filter(
    (i) =>
      (category === null || i.category_id === category) &&
      (q === '' || i.name.toLowerCase().includes(q) || (i.description?.toLowerCase().includes(q) ?? false)),
  )
}

export const QUICK_NOTES = ['No onions', 'Extra spicy', 'Mild', 'No nuts', 'Gluten free', 'On the side'] as const

/** Quick notes append, comma-separated, like Android's note sheet. */
export function appendNote(note: string, quick: string): string {
  return note.trim() === '' ? quick : `${note}, ${quick}`
}
