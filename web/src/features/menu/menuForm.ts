/**
 * Item form rules, mirroring the server (schemas/menu.py): name 1–80, description ≤300,
 * price MoneyIn (≤2 dp, 0…9999999999.99), sort order 0–10000.
 */
import { z } from 'zod'
import type { MenuItem } from '@/api/types'
import { compareMoney } from '@/lib/format'
import { parseMoney } from '@/lib/money-input'
import type { MenuItemIn, MenuItemUpdate } from './api'

export const MAX_PRICE = '9999999999.99'

/** One message per problem with a typed price, or null when it's a valid MoneyIn. */
export function priceProblem(text: string): string | null {
  if (!text.trim()) return 'Enter a price'
  const p = parseMoney(text)
  if (p === null) return 'Use a number with up to 2 decimals, e.g. 12.50'
  if (compareMoney(p, MAX_PRICE) > 0) return 'That price is too high'
  return null
}

export const itemSchema = z.object({
  categoryId: z.string().min(1, 'Pick a category'),
  name: z.string().trim().min(1, 'Name the item').max(80, 'At most 80 characters'),
  description: z.string().trim().max(300, 'At most 300 characters'),
  price: z.string().superRefine((v, ctx) => {
    const msg = priceProblem(v)
    if (msg) ctx.addIssue({ code: 'custom', message: msg })
  }),
  sortOrder: z
    .string()
    .trim()
    .regex(/^\d{1,5}$/, 'A whole number from 0 to 10000')
    .refine((v) => Number(v) <= 10_000, 'A whole number from 0 to 10000'),
})

export type ItemFormValues = z.infer<typeof itemSchema>

export function itemDefaults(item: MenuItem | null, categoryId: number | null): ItemFormValues {
  return {
    categoryId: String(item?.category_id ?? categoryId ?? ''),
    name: item?.name ?? '',
    description: item?.description ?? '',
    price: item ? (parseMoney(item.price) ?? item.price) : '',
    sortOrder: String(item?.sort_order ?? 0),
  }
}

export function createBody(v: ItemFormValues): MenuItemIn {
  const description = v.description.trim()
  return {
    category_id: Number(v.categoryId),
    name: v.name.trim(),
    description: description || null,
    price: parseMoney(v.price) ?? '0.00',
    is_available: true,
    sort_order: Number(v.sortOrder),
  }
}

/** Only the fields that changed, plus the version the edit started from. "" clears the description. */
export function updateBody(item: MenuItem, v: ItemFormValues): MenuItemUpdate {
  const body: MenuItemUpdate = { version: item.version }
  const categoryId = Number(v.categoryId)
  if (categoryId !== item.category_id) body.category_id = categoryId
  const name = v.name.trim()
  if (name !== item.name) body.name = name
  const description = v.description.trim()
  if (description !== (item.description ?? '')) body.description = description
  const price = parseMoney(v.price)
  if (price !== null && compareMoney(price, item.price) !== 0) body.price = price
  const sort = Number(v.sortOrder)
  if (sort !== item.sort_order) body.sort_order = sort
  return body
}

export function hasChanges(body: MenuItemUpdate): boolean {
  return Object.keys(body).some((k) => k !== 'version')
}

/** Client-side search over name and description (the API has no menu search). */
export function matchesQuery(item: Pick<MenuItem, 'name' | 'description'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return item.name.toLowerCase().includes(q) || (item.description ?? '').toLowerCase().includes(q)
}
