import { ApiError } from '@/api/errors'
import type { RestaurantSettings } from '@/api/types'
import { adoptsFreshData, PartialSave, saveFailureMessage, saveSettings, STALE_MESSAGE } from './saveSettings'
import { formFromSettings } from './settingsForm'

const base: RestaurantSettings = {
  restaurant_name: 'Bistro Demo', location_name: 'Main Street', address: null, timezone: 'Asia/Kolkata', currency_code: 'INR',
  service_charge_percent: '10.00', service_charge_taxable: true, rounding_increment: '1.00', bill_prefix: 'B',
  status_after_payment: 'CLEANING', version: 7,
  tax_rates: [{ id: 1, name: 'CGST', rate_percent: '2.500', is_active: true, sort_order: 0 }],
  payment_methods: [],
}

function writers(opts: { patch?: () => Promise<RestaurantSettings>; putTaxes?: () => Promise<RestaurantSettings> } = {}) {
  return {
    patch: vi.fn(opts.patch ?? (() => Promise.resolve({ ...base, version: 8, bill_prefix: 'MS' }))),
    putTaxes: vi.fn(opts.putTaxes ?? (() => Promise.resolve({ ...base, version: 9 }))),
  }
}

describe('saveSettings', () => {
  it('sends only the general part when taxes are untouched', async () => {
    const api = writers()
    const saved = await saveSettings(base, { ...formFromSettings(base), bill_prefix: 'MS' }, api)
    expect(api.patch).toHaveBeenCalledWith({ version: 7, bill_prefix: 'MS' })
    expect(api.putTaxes).not.toHaveBeenCalled()
    expect(saved.version).toBe(8)
  })

  it('chains the tax PUT onto the version the PATCH returned', async () => {
    const api = writers()
    const f = formFromSettings(base)
    const taxes = f.taxes.map((t) => ({ ...t, rate: '3' }))
    await saveSettings(base, { ...f, bill_prefix: 'MS', taxes }, api)
    expect(api.putTaxes).toHaveBeenCalledWith(expect.objectContaining({ version: 8 }))
  })

  it('reports a partial save when the general part landed but the taxes failed', async () => {
    const refused = new ApiError('validation', 'Tax names must be unique', { fields: {} })
    const api = writers({ putTaxes: () => Promise.reject(refused) })
    const f = formFromSettings(base)
    const err = await saveSettings(base, { ...f, bill_prefix: 'MS', taxes: f.taxes.map((t) => ({ ...t, rate: '3' })) }, api).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PartialSave)
    expect((err as PartialSave).saved.version).toBe(8)
    expect((err as PartialSave).error).toBe(refused)
  })

  it('passes a tax failure through as-is when nothing else was saved', async () => {
    const refused = new ApiError('validation', 'Bad rate')
    const api = writers({ putTaxes: () => Promise.reject(refused) })
    const f = formFromSettings(base)
    await expect(saveSettings(base, { ...f, taxes: f.taxes.map((t) => ({ ...t, rate: '3' })) }, api)).rejects.toBe(refused)
    expect(api.patch).not.toHaveBeenCalled()
  })
})

describe('saveFailureMessage (shown once, inline)', () => {
  it('uses what could not be placed on a field, or nothing when every error has a field', () => {
    expect(saveFailureMessage(new ApiError('validation', 'x'), 'Bill prefix is taken')).toBe('Bill prefix is taken')
    expect(saveFailureMessage(new ApiError('validation', 'x'), null)).toBeNull()
  })

  it('says someone else saved on a stale answer', () => {
    expect(saveFailureMessage(new ApiError('stale', 'x'), null)).toBe(STALE_MESSAGE)
  })

  it('says what landed on a partial save', () => {
    const e = new PartialSave(base, new ApiError('validation', 'Tax names must be unique'))
    expect(saveFailureMessage(e, 'Tax names must be unique')).toBe("General settings saved, but the taxes weren't: Tax names must be unique")
    expect(saveFailureMessage(e, null)).toMatch(/highlighted tax rows/)
  })
})

describe('adoptsFreshData', () => {
  const fresh = { ...base, version: 8 }
  it('follows the server while nothing is edited', () => {
    expect(adoptsFreshData(fresh, base, false, false)).toBe(true)
    expect(adoptsFreshData(base, base, false, false)).toBe(false)
    expect(adoptsFreshData(undefined, base, false, false)).toBe(false)
  })

  it('keeps the baseline an edit or a save started from', () => {
    expect(adoptsFreshData(fresh, base, true, false)).toBe(false)
    expect(adoptsFreshData(fresh, base, false, true)).toBe(false)
  })
})
