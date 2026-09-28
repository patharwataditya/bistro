import { describe, expect, it } from 'vitest'
import type { Report } from '@/api/types'
import { averageMinutes, breakdownRows, dailySeries, hourlySeries, isEmptyReport, tableRows, topSellerRows } from './chartData'

const day = (date: string, gross: string, refunds: string, net: string, orders = 1) => ({ date, gross_sales: gross, refunds, net_sales: net, orders })

describe('dailySeries', () => {
  it('scales net and gross to the largest value and finds the best day', () => {
    const s = dailySeries([day('2026-09-01', '100.00', '0.00', '100.00'), day('2026-09-02', '400.00', '100.00', '300.00')])
    expect(s.bars[1]?.grossRatio).toBe(1)
    expect(s.bars[1]?.netRatio).toBe(0.75)
    expect(s.best?.date).toBe('2026-09-02')
    expect(s.hasNegative).toBe(false)
    expect(s.positiveShare).toBe(1)
  })
  it('makes room below the baseline when refunds exceed a day’s sales', () => {
    const s = dailySeries([day('2026-09-01', '300.00', '0.00', '300.00'), day('2026-09-02', '0.00', '100.00', '-100.00', 0)])
    expect(s.hasNegative).toBe(true)
    expect(s.positiveShare).toBe(0.75)
    expect(s.bars[1]?.netRatio).toBe(-0.25)
  })
  it('has no best day when nothing sold', () => {
    const s = dailySeries([day('2026-09-01', '0.00', '0.00', '0.00', 0)])
    expect(s.best).toBeNull()
    expect(s.bars[0]?.netRatio).toBe(0)
  })
})

describe('hourlySeries', () => {
  it('always yields 24 bars and the busiest hour', () => {
    const { bars, peak } = hourlySeries([{ hour: 13, sales: '500.00', orders: 3 }, { hour: 19, sales: '800.00', orders: 4 }])
    expect(bars).toHaveLength(24)
    expect(bars[0]?.sales).toBe('0.00')
    expect(peak?.hour).toBe(19)
    expect(bars[13]?.ratio).toBe(0.625)
  })
  it('has no peak on a quiet day', () => {
    expect(hourlySeries([]).peak).toBeNull()
  })
})

describe('rankings', () => {
  it('sizes top sellers by quantity', () => {
    const rows = topSellerRows([
      { menu_item_id: 1, name: 'Dal', quantity: 10, revenue: '1000.00' },
      { menu_item_id: 2, name: 'Naan', quantity: 5, revenue: '250.00' },
    ])
    expect(rows.map((r) => r.ratio)).toEqual([1, 0.5])
  })
  it('keys top sellers by item and name, since a renamed item is listed once per name', () => {
    const rows = topSellerRows([
      { menu_item_id: 1, name: 'Dal Makhani', quantity: 6, revenue: '600.00' },
      { menu_item_id: 1, name: 'Dal', quantity: 4, revenue: '400.00' },
    ])
    expect(rows.map((r) => r.key)).toEqual(['1|Dal Makhani', '1|Dal'])
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
  })
  it('gives payment shares of the positive total, keeping negative amounts out of it', () => {
    const rows = breakdownRows([
      { name: 'Card', count: 2, amount: '250.00' },
      { name: 'Cash', count: 3, amount: '750.00' },
      { name: 'UPI', count: 0, amount: '-20.00' },
    ])
    expect(rows.map((r) => [r.name, r.share])).toEqual([['Cash', 75], ['Card', 25], ['UPI', 0]])
    expect(rows[2]?.amount).toBe('-20.00')
  })
  it('orders tables by revenue', () => {
    const rows = tableRows([
      { table_name: 'T1', orders: 1, revenue: '100.00', average_minutes: 30 },
      { table_name: 'T2', orders: 2, revenue: '400.00', average_minutes: 45 },
    ])
    expect(rows.map((r) => [r.table_name, r.ratio])).toEqual([['T2', 1], ['T1', 0.25]])
  })
})

describe('averageMinutes', () => {
  it('shows a dash when nothing was timed (open checks)', () => {
    expect(averageMinutes(0)).toBe('—')
    expect(averageMinutes(null)).toBe('—')
    expect(averageMinutes(42)).toBe('42 min')
  })
})

describe('isEmptyReport', () => {
  const base = {
    order_count: 0, cancelled_orders: 0, refunds: '0.00', voided_items_value: '0.00', payment_methods: [],
  } as unknown as Report
  it('is empty with nothing happening', () => expect(isEmptyReport(base)).toBe(true))
  it('is not empty with only a refund of an earlier sale', () => expect(isEmptyReport({ ...base, refunds: '50.00' })).toBe(false))
})
