/**
 * Settings form model: what the page edits, how it validates (mirroring schemas/settings.py),
 * and how an edit becomes a request that carries only what actually changed.
 */
import { z } from 'zod'
import type { RestaurantSettings } from '@/api/types'
import type { SettingsUpdate, TaxRateIn } from './api'

/** Rounding increments the server accepts, exactly as it expects them on the wire. */
export const ROUNDING_OPTIONS = ['0.01', '0.05', '0.10', '0.25', '0.50', '1.00'] as const
export type Rounding = (typeof ROUNDING_OPTIONS)[number]

export const AFTER_PAYMENT = ['AVAILABLE', 'CLEANING'] as const
export type AfterPayment = (typeof AFTER_PAYMENT)[number]

export const MAX_TAXES = 10

const PERCENT_TYPING: Record<2 | 3, RegExp> = {
  2: /^\d{0,3}(\.\d{0,2})?$/,
  3: /^\d{0,3}(\.\d{0,3})?$/,
}

/** Typing filter: lets through only text that could still become a valid percentage. */
export function acceptPercent(text: string, decimals: 2 | 3): boolean {
  return text === '' || PERCENT_TYPING[decimals].test(text)
}

/** Canonical decimal string ("10", "7.5") for a 0–100 percentage, or null if invalid. */
export function parsePercent(text: string, decimals: 2 | 3): string | null {
  const t = text.trim()
  if (!t || t === '.' || !PERCENT_TYPING[decimals].test(t)) return null
  const normalized = normalizeDecimal(t)
  const [int = '0', frac = ''] = normalized.split('.')
  const n = Number(int)
  if (n > 100 || (n === 100 && /[1-9]/.test(frac))) return null
  return normalized
}

/** "010.500" → "10.5", "5.000" → "5", ".5" → "0.5". Pure string work: no float rounding. */
export function normalizeDecimal(value: string): string {
  const [rawInt = '', rawFrac = ''] = value.trim().split('.')
  const int = rawInt.replace(/^0+(?=\d)/, '') || '0'
  const frac = rawFrac.replace(/0+$/, '')
  return frac ? `${int}.${frac}` : int
}

export const CURRENCY = /^[A-Z]{3}$/
export const BILL_PREFIX = /^[A-Z0-9-]{1,12}$/

export interface TaxDraft {
  /** Stable key for React lists and focus; `t-{id}` for saved rows, `n-…` for new ones. */
  key: string
  id: number | null
  name: string
  rate: string
  active: boolean
}

export interface SettingsValues {
  restaurant_name: string
  location_name: string
  address: string
  timezone: string
  currency_code: string
  service_charge_percent: string
  service_charge_taxable: boolean
  rounding_increment: Rounding
  bill_prefix: string
  status_after_payment: AfterPayment
  taxes: TaxDraft[]
}

const required = (label: string) => z.string().refine((v) => v.trim().length > 0, label)

export const settingsSchema = z.object({
  restaurant_name: required('Required').refine((v) => v.trim().length <= 120, 'At most 120 characters'),
  location_name: required('Required').refine((v) => v.trim().length <= 120, 'At most 120 characters'),
  address: z.string().refine((v) => v.trim().length <= 300, 'At most 300 characters'),
  timezone: required('Required, e.g. Europe/London'),
  currency_code: z.string().regex(CURRENCY, 'Three capital letters, e.g. USD'),
  service_charge_percent: z.string().refine((v) => parsePercent(v, 2) !== null, 'A percentage from 0 to 100'),
  service_charge_taxable: z.boolean(),
  rounding_increment: z.enum(ROUNDING_OPTIONS),
  bill_prefix: z.string().regex(BILL_PREFIX, '1–12 capital letters, numbers or dashes'),
  status_after_payment: z.enum(AFTER_PAYMENT),
  taxes: z
    .array(
      z.object({
        key: z.string(),
        id: z.number().nullable(),
        name: required('Name the tax').refine((v) => v.trim().length <= 60, 'At most 60 characters'),
        rate: z.string().refine((v) => parsePercent(v, 3) !== null, 'Rate from 0 to 100'),
        active: z.boolean(),
      }),
    )
    .max(MAX_TAXES, `Up to ${MAX_TAXES} taxes`),
})

function roundingOf(value: string): Rounding {
  const n = normalizeDecimal(value)
  return ROUNDING_OPTIONS.find((o) => normalizeDecimal(o) === n) ?? '0.01'
}

export function taxDrafts(s: RestaurantSettings): TaxDraft[] {
  return [...s.tax_rates]
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((t) => ({ key: `t-${t.id}`, id: t.id, name: t.name, rate: normalizeDecimal(t.rate_percent), active: t.is_active }))
}

export function formFromSettings(s: RestaurantSettings): SettingsValues {
  return {
    restaurant_name: s.restaurant_name,
    location_name: s.location_name,
    address: s.address ?? '',
    timezone: s.timezone,
    currency_code: s.currency_code,
    service_charge_percent: normalizeDecimal(s.service_charge_percent),
    service_charge_taxable: s.service_charge_taxable,
    rounding_increment: roundingOf(s.rounding_increment),
    bill_prefix: s.bill_prefix,
    status_after_payment: s.status_after_payment === 'CLEANING' ? 'CLEANING' : 'AVAILABLE',
    taxes: taxDrafts(s),
  }
}

export type SettingsChanges = Omit<SettingsUpdate, 'version'>

/**
 * Only the general fields that differ from what the edit started from. Strings are compared
 * trimmed (the server trims too) and numbers by value, so "10" vs "10.00" is not a change.
 */
export function generalDiff(base: RestaurantSettings, f: SettingsValues): SettingsChanges {
  const out: SettingsChanges = {}
  const restaurant = f.restaurant_name.trim()
  if (restaurant !== base.restaurant_name) out.restaurant_name = restaurant
  const location = f.location_name.trim()
  if (location !== base.location_name) out.location_name = location
  const address = f.address.trim()
  if (address !== (base.address ?? '')) out.address = address // "" clears it
  const tz = f.timezone.trim()
  if (tz !== base.timezone) out.timezone = tz
  if (f.currency_code !== base.currency_code) out.currency_code = f.currency_code
  const charge = parsePercent(f.service_charge_percent, 2)
  if (charge !== null && charge !== normalizeDecimal(base.service_charge_percent)) out.service_charge_percent = charge
  if (f.service_charge_taxable !== base.service_charge_taxable) out.service_charge_taxable = f.service_charge_taxable
  if (normalizeDecimal(f.rounding_increment) !== normalizeDecimal(base.rounding_increment)) out.rounding_increment = f.rounding_increment
  if (f.bill_prefix !== base.bill_prefix) out.bill_prefix = f.bill_prefix
  if (f.status_after_payment !== base.status_after_payment) out.status_after_payment = f.status_after_payment
  return out
}

function taxSignature(t: TaxDraft): string {
  return JSON.stringify([t.id, t.name.trim(), parsePercent(t.rate, 3) ?? t.rate, t.active])
}

/** The tax table is replaced as a whole; any difference (including order) means a PUT. */
export function taxesChanged(base: RestaurantSettings, drafts: readonly TaxDraft[]): boolean {
  const before = taxDrafts(base)
  if (before.length !== drafts.length) return true
  return before.some((t, i) => {
    const d = drafts[i]
    return !d || taxSignature(t) !== taxSignature(d)
  })
}

export function taxesBody(drafts: readonly TaxDraft[]): TaxRateIn[] {
  return drafts.map((d) => ({
    ...(d.id !== null ? { id: d.id } : {}),
    name: d.name.trim(),
    rate_percent: parsePercent(d.rate, 3) ?? d.rate,
    is_active: d.active,
  }))
}

export function isDirty(base: RestaurantSettings, f: SettingsValues): boolean {
  return Object.keys(generalDiff(base, f)).length > 0 || taxesChanged(base, f.taxes)
}

/** Changes that alter what `/me` reports (location name, zone, currency, restaurant name). */
export function affectsProfile(before: RestaurantSettings, after: RestaurantSettings): boolean {
  return before.timezone !== after.timezone || before.currency_code !== after.currency_code
    || before.location_name !== after.location_name || before.restaurant_name !== after.restaurant_name
}

/** Server field key → form field path ("tax_rates.2.rate_percent" → "taxes.2.rate"). */
export function formFieldFor(serverField: string): string | null {
  const tax = /^tax_rates\.(\d+)\.(name|rate_percent|is_active)$/.exec(serverField)
  if (tax) return `taxes.${tax[1]}.${tax[2] === 'rate_percent' ? 'rate' : tax[2] === 'is_active' ? 'active' : 'name'}`
  const general = ['restaurant_name', 'location_name', 'address', 'timezone', 'currency_code', 'service_charge_percent',
    'service_charge_taxable', 'rounding_increment', 'bill_prefix', 'status_after_payment']
  return general.includes(serverField) ? serverField : null
}
