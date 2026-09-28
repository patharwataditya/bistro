import { describe, expect, it } from 'vitest'
import type { RestaurantSettings } from '@/api/types'
import { acceptMoney, parseMoney } from '@/lib/money-input'
import {
  acceptPercent, affectsProfile, formFieldFor, formFromSettings, generalDiff, isDirty, normalizeDecimal, parsePercent,
  settingsSchema, taxesBody, taxesChanged,
} from './settingsForm'

const base: RestaurantSettings = {
  restaurant_name: 'Bistro Demo',
  location_name: 'Main Street',
  address: null,
  timezone: 'Asia/Kolkata',
  currency_code: 'INR',
  service_charge_percent: '10.00',
  service_charge_taxable: true,
  rounding_increment: '1.00',
  bill_prefix: 'B',
  status_after_payment: 'CLEANING',
  version: 7,
  tax_rates: [
    { id: 2, name: 'SGST', rate_percent: '2.500', is_active: true, sort_order: 1 },
    { id: 1, name: 'CGST', rate_percent: '2.500', is_active: true, sort_order: 0 },
  ],
  payment_methods: [],
}

describe('settings form', () => {
  it('round-trips the server copy with no changes', () => {
    const f = formFromSettings(base)
    expect(f.service_charge_percent).toBe('10')
    expect(f.rounding_increment).toBe('1.00')
    expect(f.taxes.map((t) => t.name)).toEqual(['CGST', 'SGST'])
    expect(generalDiff(base, f)).toEqual({})
    expect(taxesChanged(base, f.taxes)).toBe(false)
    expect(isDirty(base, f)).toBe(false)
  })

  it('sends only the fields that changed', () => {
    const f = { ...formFromSettings(base), location_name: '  Main St  ', service_charge_percent: '12.5', bill_prefix: 'MS' }
    expect(generalDiff(base, f)).toEqual({ location_name: 'Main St', service_charge_percent: '12.5', bill_prefix: 'MS' })
  })

  it('treats equal numbers and trimmed strings as unchanged', () => {
    const f = { ...formFromSettings(base), service_charge_percent: '10.0', restaurant_name: ' Bistro Demo ' }
    expect(generalDiff(base, f)).toEqual({})
  })

  it('clears the address with an empty string, and only when it had one', () => {
    const withAddress = { ...base, address: '12 High St' }
    expect(generalDiff(withAddress, { ...formFromSettings(withAddress), address: '  ' })).toEqual({ address: '' })
    expect(generalDiff(base, { ...formFromSettings(base), address: '' })).toEqual({})
  })

  it('detects tax edits, additions, removals and reordering', () => {
    const f = formFromSettings(base)
    const [c, g] = f.taxes
    if (!c || !g) throw new Error('fixture')
    expect(taxesChanged(base, [{ ...c, rate: '2.50' }, g])).toBe(false)
    expect(taxesChanged(base, [{ ...c, active: false }, g])).toBe(true)
    expect(taxesChanged(base, [g, c])).toBe(true)
    expect(taxesChanged(base, f.taxes.slice(1))).toBe(true)
    expect(taxesChanged(base, [...f.taxes, { key: 'n-1', id: null, name: 'Cess', rate: '1', active: true }])).toBe(true)
  })

  it('builds the tax PUT body without ids for new rows', () => {
    expect(taxesBody([
      { key: 't-1', id: 1, name: ' CGST ', rate: '2.50', active: true },
      { key: 'n-1', id: null, name: 'Cess', rate: '1', active: false },
    ])).toEqual([
      { id: 1, name: 'CGST', rate_percent: '2.5', is_active: true },
      { name: 'Cess', rate_percent: '1', is_active: false },
    ])
  })

  it('flags profile-affecting saves', () => {
    expect(affectsProfile(base, { ...base, bill_prefix: 'X' })).toBe(false)
    expect(affectsProfile(base, { ...base, currency_code: 'EUR' })).toBe(true)
  })

  it('maps server field errors onto form fields', () => {
    expect(formFieldFor('tax_rates.2.rate_percent')).toBe('taxes.2.rate')
    expect(formFieldFor('tax_rates.0.name')).toBe('taxes.0.name')
    expect(formFieldFor('bill_prefix')).toBe('bill_prefix')
    expect(formFieldFor('version')).toBeNull()
  })

  it('validates like the server', () => {
    const ok = formFromSettings(base)
    expect(settingsSchema.safeParse(ok).success).toBe(true)
    const bad = settingsSchema.safeParse({ ...ok, currency_code: 'inr', bill_prefix: 'b_1', service_charge_percent: '100.01', location_name: ' ' })
    expect(bad.success).toBe(false)
    const paths = bad.error?.issues.map((i) => i.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['currency_code', 'bill_prefix', 'service_charge_percent', 'location_name']))
  })
})

describe('percent input', () => {
  it('filters typing to at most 3 integer digits and the allowed decimals', () => {
    expect(acceptPercent('', 2)).toBe(true)
    expect(acceptPercent('12.', 2)).toBe(true)
    expect(acceptPercent('12.34', 2)).toBe(true)
    expect(acceptPercent('12.345', 2)).toBe(false)
    expect(acceptPercent('12.345', 3)).toBe(true)
    expect(acceptPercent('1000', 3)).toBe(false)
    expect(acceptPercent('1e2', 3)).toBe(false)
  })

  it('parses 0–100 exactly, without floats', () => {
    expect(parsePercent('0', 2)).toBe('0')
    expect(parsePercent('100', 2)).toBe('100')
    expect(parsePercent('100.00', 2)).toBe('100')
    expect(parsePercent('100.01', 2)).toBeNull()
    expect(parsePercent('101', 2)).toBeNull()
    expect(parsePercent('.', 2)).toBeNull()
    expect(parsePercent('', 2)).toBeNull()
    expect(parsePercent('.5', 2)).toBe('0.5')
    expect(parsePercent('7.125', 3)).toBe('7.125')
    expect(parsePercent('7.125', 2)).toBeNull()
  })

  it('normalises decimal strings', () => {
    expect(normalizeDecimal('010.500')).toBe('10.5')
    expect(normalizeDecimal('5.000')).toBe('5')
    expect(normalizeDecimal('0.00')).toBe('0')
  })
})

describe('money input', () => {
  it('accepts only what could become an amount', () => {
    expect(acceptMoney('')).toBe(true)
    expect(acceptMoney('12.5')).toBe(true)
    expect(acceptMoney('12,50')).toBe(true)
    expect(acceptMoney('12.505')).toBe(false)
    expect(acceptMoney('-1')).toBe(false)
    expect(acceptMoney('12345678901')).toBe(false)
  })

  it('normalises to cents', () => {
    expect(parseMoney('12')).toBe('12.00')
    expect(parseMoney('12,5')).toBe('12.50')
    expect(parseMoney('0012.05')).toBe('12.05')
    expect(parseMoney('9999999999.99')).toBe('9999999999.99')
    expect(parseMoney('.')).toBeNull()
    expect(parseMoney('')).toBeNull()
  })
})
