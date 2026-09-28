/** Audit log filters: the chip set, and how the screen's filter state maps onto the API query. */
import type { AuditFilter } from '@/api/queries'
import { addDays, isIsoDate, startOfDayInZone } from '@/features/reports/range'

export interface AuditChip {
  key: string
  label: string
  /** `action` prefix sent to the API; null = everything. */
  prefix: string | null
}

export const AUDIT_CHIPS: readonly AuditChip[] = [
  { key: 'all', label: 'All', prefix: null },
  { key: 'orders', label: 'Orders', prefix: 'order.' },
  { key: 'billing', label: 'Billing', prefix: 'bill.' },
  { key: 'payments', label: 'Payments', prefix: 'payment.' },
  { key: 'staff', label: 'Staff', prefix: 'staff.' },
  { key: 'roles', label: 'Roles', prefix: 'role.' },
  { key: 'menu', label: 'Menu', prefix: 'menu.' },
  { key: 'settings', label: 'Settings', prefix: 'settings.' },
  { key: 'tables', label: 'Tables', prefix: 'table.' },
  { key: 'areas', label: 'Areas', prefix: 'area.' },
  { key: 'kitchen', label: 'Kitchen', prefix: 'kitchen.' },
]

export function chipByKey(key: string | null): AuditChip {
  return AUDIT_CHIPS.find((c) => c.key === key) ?? (AUDIT_CHIPS[0] as AuditChip)
}

export interface AuditScreenFilter {
  chip: string
  actorId: number | null
  /** Restaurant-local dates (YYYY-MM-DD), inclusive; '' = open-ended. */
  from: string
  to: string
}

export function dateRangeError(from: string, to: string): string | null {
  if (from && !isIsoDate(from)) return 'Enter a valid date'
  if (to && !isIsoDate(to)) return 'Enter a valid date'
  if (from && to && to < from) return 'The end date is before the start date'
  return null
}

/**
 * The API window is [since, until) in UTC instants. "From 3 Sept" is local midnight on 3 Sept;
 * "to 5 Sept" includes all of 5 Sept, so `until` is local midnight on 6 Sept.
 * An invalid date range is dropped rather than sent.
 */
export function toAuditQuery(f: AuditScreenFilter, zone: string): AuditFilter {
  const chip = chipByKey(f.chip)
  const out: AuditFilter = {}
  if (chip.prefix) out.action = chip.prefix
  if (f.actorId !== null) out.actorId = f.actorId
  if (dateRangeError(f.from, f.to) === null) {
    if (f.from) out.since = startOfDayInZone(f.from, zone)
    if (f.to) out.until = startOfDayInZone(addDays(f.to, 1), zone)
  }
  return out
}

/** "payment_method_id" → "Payment method id" (Android's humanize). */
export function humanize(key: string): string {
  const s = key.replaceAll('_', ' ').replaceAll('.', ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Metadata values as plain text. Objects and arrays are JSON; nothing is ever HTML. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value) && value.length === 0) return '—'
  if (Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')) return value.join(', ')
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
