/** Money, time and duration formatting in one place, so every screen reads the same. */
const moneyFormats = new Map<string, Intl.NumberFormat>()

function moneyFormat(currency: string): Intl.NumberFormat {
  let f = moneyFormats.get(currency)
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    } catch {
      f = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    moneyFormats.set(currency, f)
  }
  return f
}

/**
 * Formats a server decimal string for display. Intl.NumberFormat accepts decimal strings
 * exactly (no binary floating point), so "0.10" never becomes 0.1000000001.
 */
export function money(amount: string, currency: string): string {
  return moneyFormat(currency).format(amount as unknown as number)
}

export function signedMoney(amount: string, currency: string): string {
  const neg = amount.trim().startsWith('-')
  const abs = neg ? amount.trim().slice(1) : amount
  if (/^0*(\.0*)?$/.test(abs)) return money(abs, currency)
  return (neg ? '−' : '+') + money(abs, currency)
}

export function percent(value: string): string {
  const n = value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value
  return `${n}%`
}

export function isZero(amount: string): boolean {
  return /^-?0*(\.0*)?$/.test(amount.trim())
}

export function isPositive(amount: string): boolean {
  return !amount.trim().startsWith('-') && !isZero(amount)
}

/** Compare two non-negative decimal strings exactly (no float conversion). */
export function compareMoney(a: string, b: string): number {
  const [ai = '0', af = ''] = a.replace(/^-/, '').split('.')
  const [bi = '0', bf = ''] = b.replace(/^-/, '').split('.')
  const aInt = ai.replace(/^0+/, '') || '0'
  const bInt = bi.replace(/^0+/, '') || '0'
  if (aInt.length !== bInt.length) return aInt.length < bInt.length ? -1 : 1
  if (aInt !== bInt) return aInt < bInt ? -1 : 1
  const len = Math.max(af.length, bf.length)
  const aF = af.padEnd(len, '0')
  const bF = bf.padEnd(len, '0')
  return aF === bF ? 0 : aF < bF ? -1 : 1
}

/** "4m", "1h 12m": compact elapsed time for tickets and tables. Never negative. */
export function elapsed(from: string | Date, now: number): string {
  const ms = Math.max(0, now - new Date(from).getTime())
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** Kitchen timer: "14m 05s", never "14:05" (which reads as a time of day). */
export function clock(from: string | Date, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000))
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}

export function minutesSince(from: string | Date, now: number): number {
  return Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000))
}

export function time(iso: string, zone: string): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short', timeZone: zone }).format(new Date(iso))
}

export function dateTime(iso: string, zone: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(new Date(iso))
}

export function dateOnly(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)))
}

export function relative(iso: string, now: number, zone: string): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 12 * 60) return `${Math.floor(minutes / 60)}h ago`
  return dateTime(iso, zone)
}

/** Today's date (YYYY-MM-DD) in the restaurant's time zone, on the given clock. */
export function localDate(zone: string, now: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
  return parts
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
