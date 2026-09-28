/**
 * Pure transforms from ReportOut to chart geometry inputs. Amounts stay server strings for
 * display; numbers here are only used to size bars (never shown, never summed for money).
 */
import type { Report } from '@/api/types'

type Daily = Report['daily'][number]
type Hourly = Report['hourly'][number]
type Named = Report['payment_methods'][number]
type TopItem = Report['top_items'][number]
type TableUse = Report['tables'][number]

/** Bar-sizing value of a decimal string. NaN-safe. */
export function magnitude(amount: string): number {
  const n = Number.parseFloat(amount)
  return Number.isFinite(n) ? n : 0
}

export interface DayBar {
  date: string
  gross: string
  refunds: string
  net: string
  orders: number
  /** Heights as a fraction of the scale (net may be negative). */
  grossRatio: number
  netRatio: number
}

export interface DailySeries {
  bars: DayBar[]
  /** The day with the highest net sales, or null when nothing sold. */
  best: DayBar | null
  /** Whether any day went below zero (refunds beyond that day's sales). */
  hasNegative: boolean
  /** Share of the chart height above the baseline (1 when nothing is negative). */
  positiveShare: number
}

export function dailySeries(daily: readonly Daily[]): DailySeries {
  const top = Math.max(0, ...daily.map((d) => Math.max(magnitude(d.gross_sales), magnitude(d.net_sales))))
  const bottom = Math.max(0, ...daily.map((d) => -magnitude(d.net_sales)))
  const scale = top + bottom || 1
  const bars = daily.map<DayBar>((d) => ({
    date: d.date,
    gross: d.gross_sales,
    refunds: d.refunds,
    net: d.net_sales,
    orders: d.orders,
    grossRatio: magnitude(d.gross_sales) / scale,
    netRatio: magnitude(d.net_sales) / scale,
  }))
  let best: DayBar | null = null
  for (const b of bars) if (magnitude(b.net) > 0 && (!best || magnitude(b.net) > magnitude(best.net))) best = b
  return { bars, best, hasNegative: bottom > 0, positiveShare: top / scale || 1 }
}

export interface HourBar {
  hour: number
  sales: string
  orders: number
  ratio: number
}

/** Always 24 rows (hours missing from the payload count as zero), plus the busiest hour. */
export function hourlySeries(hourly: readonly Hourly[]): { bars: HourBar[]; peak: HourBar | null } {
  const byHour = new Map(hourly.map((h) => [h.hour, h]))
  const max = Math.max(0, ...hourly.map((h) => magnitude(h.sales))) || 1
  const bars = Array.from({ length: 24 }, (_, hour): HourBar => {
    const h = byHour.get(hour)
    const sales = h?.sales ?? '0.00'
    return { hour, sales, orders: h?.orders ?? 0, ratio: Math.max(0, magnitude(sales)) / max }
  })
  let peak: HourBar | null = null
  for (const b of bars) if (magnitude(b.sales) > 0 && (!peak || magnitude(b.sales) > magnitude(peak.sales))) peak = b
  return { bars, peak }
}

/** "7 pm" style hour label in the viewer's locale. */
export function hourLabel(hour: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, hour % 24)))
}

export function hourRange(hour: number): string {
  return `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`
}

export interface RankRow {
  key: string
  name: string
  count: number
  amount: string
  /** Bar length, 0..1. */
  ratio: number
  /** Whole-number share of the positive total, for breakdowns; null for rankings. */
  share: number | null
}

/** Top sellers: bar length by quantity (the API ranks by quantity). */
export function topSellerRows(items: readonly TopItem[]): RankRow[] {
  const max = Math.max(1, ...items.map((i) => i.quantity))
  return items.map((i) => ({ key: String(i.menu_item_id), name: i.name, count: i.quantity, amount: i.revenue, ratio: i.quantity / max, share: null }))
}

/**
 * Payment methods / staff: share of the positive total. A method can be net negative (refunds
 * beyond payments in the range); it keeps its amount but takes no share of the bar.
 */
export function breakdownRows(rows: readonly Named[]): RankRow[] {
  const total = rows.reduce((sum, r) => sum + Math.max(0, magnitude(r.amount)), 0)
  const sorted = [...rows].sort((a, b) => magnitude(b.amount) - magnitude(a.amount))
  return sorted.map((r) => {
    const share = total > 0 ? Math.max(0, magnitude(r.amount)) / total : 0
    return { key: r.name, name: r.name, count: r.count, amount: r.amount, ratio: share, share: Math.round(share * 100) }
  })
}

/** Tables by revenue, highest first, with a bar relative to the best table. */
export function tableRows(tables: readonly TableUse[]): (TableUse & { ratio: number })[] {
  const sorted = [...tables].sort((a, b) => magnitude(b.revenue) - magnitude(a.revenue))
  const max = Math.max(0, ...sorted.map((t) => magnitude(t.revenue))) || 1
  return sorted.map((t) => ({ ...t, ratio: Math.max(0, magnitude(t.revenue)) / max }))
}

/** Nothing to chart: no settled bills, no refunds and no cancellations in the range. */
export function isEmptyReport(r: Report): boolean {
  return r.order_count === 0 && r.cancelled_orders === 0 && magnitude(r.refunds) === 0 && magnitude(r.voided_items_value) === 0
    && r.payment_methods.length === 0
}
