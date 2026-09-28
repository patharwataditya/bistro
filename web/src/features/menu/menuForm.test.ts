import type { MenuItem } from '@/api/types'
import { createBody, hasChanges, itemDefaults, itemSchema, matchesQuery, updateBody, type ItemFormValues } from './menuForm'

const item: MenuItem = { id: 7, category_id: 2, name: 'Masala Dosa', description: 'Crisp rice crepe', price: '180.00', is_available: true, sort_order: 3, version: 5 }
const valid: ItemFormValues = { categoryId: '2', name: 'Masala Dosa', description: 'Crisp rice crepe', price: '180', sortOrder: '3' }

function errors(v: Partial<ItemFormValues>): string[] {
  const r = itemSchema.safeParse({ ...valid, ...v })
  return r.success ? [] : r.error.issues.map((i) => String(i.path[0]))
}

describe('item form validation', () => {
  it('accepts a valid item', () => expect(errors({})).toEqual([]))
  it('requires a trimmed name of at most 80', () => {
    expect(errors({ name: '   ' })).toEqual(['name'])
    expect(errors({ name: 'x'.repeat(81) })).toEqual(['name'])
    expect(errors({ name: 'x'.repeat(80) })).toEqual([])
  })
  it('limits the description to 300', () => {
    expect(errors({ description: 'x'.repeat(301) })).toEqual(['description'])
  })
  it('validates money input', () => {
    expect(errors({ price: '' })).toEqual(['price'])
    expect(errors({ price: '12.345' })).toEqual(['price'])
    expect(errors({ price: 'abc' })).toEqual(['price'])
    expect(errors({ price: '12,5' })).toEqual([])
    expect(errors({ price: '0' })).toEqual([])
    expect(errors({ price: '9999999999.99' })).toEqual([])
  })
  it('keeps sort order within 0–10000', () => {
    expect(errors({ sortOrder: '10001' })).toEqual(['sortOrder'])
    expect(errors({ sortOrder: '-1' })).toEqual(['sortOrder'])
    expect(errors({ sortOrder: '10000' })).toEqual([])
  })
  it('requires a category', () => expect(errors({ categoryId: '' })).toEqual(['categoryId']))
})

describe('item request bodies', () => {
  it('creates with normalised price and null empty description', () => {
    expect(createBody({ ...valid, description: '  ', price: '12,5' })).toEqual({
      category_id: 2, name: 'Masala Dosa', description: null, price: '12.50', is_available: true, sort_order: 3,
    })
  })
  it('sends only the version when nothing changed (price compared as money)', () => {
    const body = updateBody(item, { ...valid, price: '180.0' })
    expect(body).toEqual({ version: 5 })
    expect(hasChanges(body)).toBe(false)
  })
  it('sends only changed fields, "" clears the description', () => {
    expect(updateBody(item, { ...valid, description: '', price: '195.5', name: ' Masala Dosa ' })).toEqual({ version: 5, description: '', price: '195.50' })
    expect(updateBody(item, { ...valid, categoryId: '4', sortOrder: '1' })).toEqual({ version: 5, category_id: 4, sort_order: 1 })
  })
  it('prefills the form from an item', () => {
    expect(itemDefaults(item, null)).toEqual({ categoryId: '2', name: 'Masala Dosa', description: 'Crisp rice crepe', price: '180.00', sortOrder: '3' })
    expect(itemDefaults(null, 9).categoryId).toBe('9')
  })
})

describe('menu search', () => {
  it('matches name or description, case-insensitively', () => {
    expect(matchesQuery(item, 'dosa')).toBe(true)
    expect(matchesQuery(item, 'CREPE')).toBe(true)
    expect(matchesQuery(item, 'naan')).toBe(false)
    expect(matchesQuery({ name: 'Tea', description: null }, ' ')).toBe(true)
  })
})
