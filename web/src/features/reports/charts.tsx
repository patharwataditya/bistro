/**
 * Hand-drawn SVG charts for Reports. Calm by design: one series colour, recessive baseline,
 * a single highlighted bar, a tooltip on hover or arrow keys, and a data table for anyone who
 * prefers (or needs) the numbers.
 */
import { Table2, BarChart3 } from 'lucide-react'
import { motion } from 'motion/react'
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { dateOnly, money, plural } from '@/lib/format'
import { Card } from '@/ui/Card'
import { cn } from '@/ui/cn'
import { hourLabel, hourRange, type DailySeries, type HourBar, type RankRow } from './chartData'

export interface Bar {
  key: string
  /** Main bar, fraction of the plot height (negative goes below the baseline). */
  ratio: number
  /** Optional ghost bar behind the main one (e.g. gross behind net). */
  ghost?: number
  highlight?: boolean
}

/** Path for a bar with 3px-rounded data end, anchored flat on the baseline. */
function barPath(x: number, w: number, base: number, h: number): string {
  if (Math.abs(h) < 0.5) return ''
  const r = Math.min(3, w / 2, Math.abs(h))
  if (h > 0) {
    const top = base - h
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`
  }
  const bottom = base - h
  return `M${x},${base}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + w - r}Q${x + w},${bottom} ${x + w},${bottom - r}V${base}Z`
}

const WIDTH = 720

export function BarChart({
  bars, height, positiveShare = 1, summary, tooltip, axis, gap = 4, baseColor, highlightColor,
}: {
  bars: Bar[]
  height: number
  positiveShare?: number
  /** Screen-reader summary of the whole chart. */
  summary: string
  tooltip: (index: number) => ReactNode
  axis: ReactNode
  gap?: number
  baseColor: string
  highlightColor: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const tipId = useId()
  const n = bars.length
  const slot = WIDTH / Math.max(n, 1)
  // Few bars stay slender rather than turning into blocks.
  const space = n <= 14 ? Math.max(gap, slot * 0.35) : gap
  const barW = Math.max(1, slot - space)
  const base = height * positiveShare

  const indexAt = (e: PointerEvent<HTMLDivElement>) => {
    const rect = plotRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * n)
    return Math.min(n - 1, Math.max(0, i))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return
    const cur = active ?? -1
    let next: number | null = null
    if (e.key === 'ArrowRight') next = Math.min(n - 1, cur + 1)
    else if (e.key === 'ArrowLeft') next = Math.max(0, cur < 0 ? n - 1 : cur - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Escape') { setActive(null); return }
    if (next !== null) {
      e.preventDefault()
      setActive(next)
    }
  }

  const leftPct = active === null ? 0 : ((active + 0.5) / n) * 100

  return (
    <div className="relative">
      <div
        ref={plotRef}
        role="img"
        aria-label={summary}
        aria-describedby={active !== null ? tipId : undefined}
        tabIndex={0}
        onPointerMove={(e) => setActive(indexAt(e))}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
        className="relative rounded-[var(--radius-sm)] outline-none"
        style={{ height }}
      >
        <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" className="block size-full overflow-visible" aria-hidden>
          {bars.map((b, i) => {
            const x = i * slot + space / 2
            const dim = active !== null && active !== i
            return (
              <g key={b.key} style={{ opacity: dim ? 0.45 : 1, transition: 'opacity 140ms' }}>
                {b.ghost !== undefined && b.ghost > 0 && (
                  <path d={barPath(x, barW, base, b.ghost * height)} fill="var(--border-strong)" opacity={0.7} />
                )}
                <motion.path
                  d={barPath(x, barW, base, b.ratio * height)}
                  fill={b.ratio < 0 ? 'var(--danger)' : b.highlight ? highlightColor : baseColor}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.36, ease: [0.05, 0.7, 0.1, 1], delay: Math.min(i * 0.008, 0.2) }}
                  style={{ originY: b.ratio < 0 ? 0 : 1 }}
                />
              </g>
            )
          })}
          <line x1={0} x2={WIDTH} y1={base} y2={base} stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
        {active !== null && (
          <div
            id={tipId}
            role="status"
            className="pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[240px] -translate-x-1/2 rounded-[var(--radius-sm)] border border-line-strong bg-raised px-3 py-2 shadow-float"
            style={{ left: `clamp(80px, ${leftPct}%, calc(100% - 80px))` }}
          >
            {tooltip(active)}
          </div>
        )}
      </div>
      <div className="mt-2">{axis}</div>
    </div>
  )
}

/** Card wrapper with a title, an optional legend, and a chart ⇄ table toggle. */
export function ChartCard({ title, subtitle, legend, chart, table, caption, className }: {
  title: string
  subtitle?: ReactNode
  legend?: ReactNode
  chart: ReactNode
  table: ReactNode
  caption?: ReactNode
  className?: string
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <Card flat className={cn('flex min-w-0 flex-col gap-4 p-5', className)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="t-card-title text-fg">{title}</h2>
          {subtitle && <p className="t-support text-fg2">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="t-meta inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-fg2 hover:bg-[var(--hover-overlay)] hover:text-fg"
        >
          {asTable ? <BarChart3 aria-hidden className="size-4" /> : <Table2 aria-hidden className="size-4" />}
          {asTable ? 'Chart' : 'Table'}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-[360px] overflow-auto">{table}</div>
      ) : (
        <>
          {chart}
          {/* The numbers stay available to assistive technology while the chart is shown. */}
          <div className="sr-only">{table}</div>
          {(legend || caption) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {legend}
              {caption && <p className="t-support text-fg2">{caption}</p>}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

export function LegendItem({ label, swatch }: { label: string; swatch: 'solid' | 'ghost' | 'accent' | 'danger' | 'info' }) {
  const cls = {
    solid: 'bg-fg2',
    ghost: 'bg-line-strong',
    accent: 'bg-accent',
    danger: 'bg-danger',
    info: 'bg-info',
  }[swatch]
  return (
    <span className="t-meta inline-flex items-center gap-1.5 text-fg2">
      <span aria-hidden className={cn('size-2.5 rounded-[3px]', cls)} />
      {label}
    </span>
  )
}

function SimpleTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} scope="col" className={cn('t-status sticky top-0 border-b border-line bg-surface py-2 pr-3 text-fg3', i > 0 && 'text-right')}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, ci) => (
              <td key={ci} className={cn('t-support border-b border-line py-2 pr-3 text-fg last:pr-0', ci > 0 && 'text-right tabular-nums')}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TipLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="t-meta text-fg2">{label}</span>
      <span className={cn('tabular-nums', strong ? 't-amount text-fg' : 't-amount-sm text-fg')}>{value}</span>
    </div>
  )
}

export function DailyChart({ series, currency }: { series: DailySeries; currency: string }) {
  const { bars, best } = series
  const m = (v: string) => money(v, currency)
  const summary = best
    ? `Net sales by day, ${bars.length} days. Best day ${dateOnly(best.date)} with ${m(best.net)}.`
    : `Net sales by day, ${bars.length} days. No sales.`
  const label = (i: number) => (bars[i] ? dateOnly(bars[i].date) : '')
  const mid = Math.floor((bars.length - 1) / 2)
  return (
    <ChartCard
      title="Net sales by day"
      subtitle="Gross sales less refunds, by the day they happened"
      legend={<><LegendItem label="Net sales" swatch="accent" /><LegendItem label="Gross sales" swatch="ghost" />{series.hasNegative && <LegendItem label="Below zero (refunds exceeded sales)" swatch="danger" />}</>}
      chart={
        <BarChart
          height={180}
          gap={bars.length > 40 ? 2 : 6}
          positiveShare={series.positiveShare}
          baseColor="var(--accent)"
          highlightColor="var(--accent)"
          bars={bars.map((b) => ({ key: b.date, ratio: b.netRatio, ghost: b.grossRatio }))}
          summary={summary}
          tooltip={(i) => {
            const b = bars[i]
            if (!b) return null
            return (
              <div className="flex min-w-[180px] flex-col gap-0.5">
                <span className="t-body-strong text-fg">{dateOnly(b.date)}</span>
                <TipLine label="Gross" value={m(b.gross)} />
                <TipLine label="Refunds" value={m(b.refunds)} />
                <TipLine label="Net" value={m(b.net)} strong />
                <span className="t-meta text-fg3">{plural(b.orders, 'bill')}</span>
              </div>
            )
          }}
          axis={
            <div className="t-meta flex justify-between text-fg3">
              <span>{label(0)}</span>
              {bars.length > 6 && <span>{label(mid)}</span>}
              <span>{label(bars.length - 1)}</span>
            </div>
          }
        />
      }
      table={
        <SimpleTable
          caption="Sales by day"
          head={['Date', 'Bills', 'Gross', 'Refunds', 'Net']}
          rows={bars.map((b) => [dateOnly(b.date), b.orders, m(b.gross), m(b.refunds), m(b.net)])}
        />
      }
    />
  )
}

export function HourlyChart({ bars, peak, currency }: { bars: HourBar[]; peak: HourBar | null; currency: string }) {
  const m = (v: string) => money(v, currency)
  const caption = peak ? `Busiest: ${hourRange(peak.hour)} · ${m(peak.sales)}` : 'No bills settled in this period.'
  return (
    <ChartCard
      title="When bills are settled"
      subtitle="Gross sales by hour, restaurant time"
      caption={caption}
      chart={
        <BarChart
          height={120}
          gap={4}
          baseColor="color-mix(in srgb, var(--info) 55%, transparent)"
          highlightColor="var(--accent)"
          bars={bars.map((b) => ({ key: String(b.hour), ratio: b.ratio, highlight: peak?.hour === b.hour }))}
          summary={`Gross sales by hour. ${caption}`}
          tooltip={(i) => {
            const b = bars[i]
            if (!b) return null
            return (
              <div className="flex min-w-[150px] flex-col gap-0.5">
                <span className="t-body-strong text-fg">{hourRange(b.hour)}</span>
                <TipLine label="Gross" value={m(b.sales)} strong />
                <span className="t-meta text-fg3">{plural(b.orders, 'bill')}</span>
              </div>
            )
          }}
          axis={
            <div aria-hidden className="t-meta relative h-4 text-fg3">
              {[0, 6, 12, 18, 23].map((h) => (
                <span
                  key={h}
                  className="absolute top-0 whitespace-nowrap"
                  style={h === 0 ? { left: 0 } : h === 23 ? { right: 0 } : { left: `${((h + 0.5) / 24) * 100}%`, transform: 'translateX(-50%)' }}
                >
                  {hourLabel(h)}
                </span>
              ))}
            </div>
          }
        />
      }
      table={
        <SimpleTable
          caption="Gross sales by hour"
          head={['Hour', 'Bills', 'Gross']}
          rows={bars.map((b) => [hourRange(b.hour), b.orders, m(b.sales)])}
        />
      }
    />
  )
}

/** Horizontal rank bars as a list: name, caption, amount, then the bar. */
export function RankList({ rows, currency, caption, label }: {
  rows: RankRow[]
  currency: string
  caption: (row: RankRow) => string
  label: string
}) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1.5 border-b border-line py-2.5 last:border-b-0">
          <div className="flex items-baseline gap-3">
            <div className="min-w-0 flex-1">
              <div className="t-body-strong truncate text-fg">{r.name}</div>
              <div className="t-meta text-fg2">{caption(r)}</div>
            </div>
            <span className="t-amount text-fg">{money(r.amount, currency)}</span>
          </div>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(r.ratio > 0 ? 1.5 : 0, r.ratio * 100)}%` }}
              transition={{ duration: 0.36, ease: [0.05, 0.7, 0.1, 1] }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}
