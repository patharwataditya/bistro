import { CalendarRange, ChartLine, CircleAlert } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { useReport } from '@/api/queries'
import type { Report } from '@/api/types'
import { useMe } from '@/auth/session'
import { money, plural } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { cn } from '@/ui/cn'
import { ChipRow } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { PageHeader } from '@/ui/Page'
import { EmptyState, ErrorState, Skeleton, StaleBanner } from '@/ui/States'
import { DataTable, Td, Th, Tr } from '@/ui/Table'
import { averageMinutes, breakdownRows, dailySeries, hourlySeries, isEmptyReport, tableRows, topSellerRows } from './chartData'
import { DailyChart, HourlyChart, RankList } from './charts'
import { parseReportParams, type Choice } from './params'
import { PRESETS, PRESET_LABEL, presetRangeInZone, rangeError, rangeLabel, type DateRange, type Preset } from './range'
import { serverNow } from './serverClock'

const CHOICES: readonly Choice[] = [...PRESETS, 'custom']

/** The selected range lives in the URL, so a report can be bookmarked or shared. */
function useRange(zone: string) {
  const [params, setParams] = useSearchParams()
  const parsed = useMemo(() => parseReportParams(params), [params])
  // Restaurant "today" on the server's clock where one is known (see serverClockOffset).
  const now = serverNow(useQueryClient())
  const range: DateRange = parsed.custom ?? presetRangeInZone(parsed.choice as Preset, zone, now)
  return {
    choice: parsed.choice,
    problem: parsed.problem,
    range,
    selectPreset: (p: Preset) => setParams(p === 'today' ? {} : { range: p }, { replace: true }),
    selectCustom: (r: DateRange) => setParams({ start: r.start, end: r.end }, { replace: true }),
  }
}

export default function ReportsPage() {
  const { me } = useMe()
  const zone = me.location.timezone
  const { choice, problem, range, selectPreset, selectCustom } = useRange(zone)
  const [customOpen, setCustomOpen] = useState(choice === 'custom' || problem !== null)
  const query = useReport(range.start, range.end)
  const report = query.data
  const showCustom = customOpen || choice === 'custom'

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <PageHeader eyebrow={me.restaurant_name} title="Reports" subtitle={`Sales and operations · ${me.location.name}`} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ChipRow<Choice>
            ariaLabel="Date range"
            options={CHOICES}
            value={showCustom ? 'custom' : choice}
            keyOf={(c) => c}
            label={(c) => (c === 'custom' ? 'Custom…' : PRESET_LABEL[c])}
            onChange={(c) => {
              if (c === 'custom') setCustomOpen(true)
              else {
                setCustomOpen(false)
                selectPreset(c)
              }
            }}
          />
          <p className="t-support ml-auto flex items-center gap-1.5 text-fg2" aria-live="polite">
            <CalendarRange aria-hidden className="size-4 text-fg3" />
            {rangeLabel(range)}
          </p>
        </div>
        {showCustom && (
          <CustomRange
            key={problem ? 'problem' : 'normal'}
            initial={problem?.draft ?? range}
            notice={problem?.message ?? null}
            onApply={selectCustom}
          />
        )}
      </div>

      {query.isError && report && <StaleBanner error={query.error} />}

      {!report ? (
        query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <ReportSkeleton />
      ) : (
        <div className={cn('transition-opacity duration-200', query.isPlaceholderData && 'opacity-60')} aria-busy={query.isFetching || undefined}>
          <ReportContent report={report} />
        </div>
      )}
    </div>
  )
}

function CustomRange({ initial, notice, onApply }: { initial: DateRange; notice: string | null; onApply: (r: DateRange) => void }) {
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  // A link with unusable dates shows why straight away.
  const [touched, setTouched] = useState(notice !== null)
  const error = rangeError(start, end)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!error) onApply({ start, end })
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
      {notice && (
        <p role="alert" className="t-support flex items-start gap-2 rounded-[var(--radius-md)] bg-warning-soft px-3 py-2 text-warning">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {notice}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <TextField label="From" type="date" value={start} min="2000-01-01" max="2100-12-31" onChange={(e) => setStart(e.target.value)} wrapperClassName="w-[180px]" />
        <TextField label="To" type="date" value={end} min="2000-01-01" max="2100-12-31" onChange={(e) => setEnd(e.target.value)} wrapperClassName="w-[180px]"
          error={touched ? error : null} hint={touched ? undefined : 'Up to 366 days'} />
        <Button type="submit" variant="primary" className="mt-[22px]">Show report</Button>
      </div>
    </form>
  )
}

function ReportSkeleton() {
  return (
    <div role="status" aria-label="Loading report" className="grid grid-cols-12 gap-4">
      <Skeleton className="col-span-12 h-[168px] xl:col-span-5" />
      <div className="@container col-span-12 xl:col-span-7">
        <div className="grid grid-cols-2 gap-3 @[52rem]:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[76px]" />)}
        </div>
      </div>
      <Skeleton className="col-span-12 h-[260px]" />
      <Skeleton className="col-span-12 h-[220px] lg:col-span-6" />
      <Skeleton className="col-span-12 h-[220px] lg:col-span-6" />
    </div>
  )
}

function ReportContent({ report: r }: { report: Report }) {
  const cur = r.currency_code
  const m = (v: string) => money(v, cur)
  const daily = useMemo(() => dailySeries(r.daily), [r.daily])
  const hourly = useMemo(() => hourlySeries(r.hourly), [r.hourly])
  const sellers = useMemo(() => topSellerRows(r.top_items), [r.top_items])
  const methods = useMemo(() => breakdownRows(r.payment_methods), [r.payment_methods])
  const staff = useMemo(() => breakdownRows(r.staff), [r.staff])
  const tables = useMemo(() => tableRows(r.tables), [r.tables])
  const empty = isEmptyReport(r)

  return (
    <div className="grid grid-cols-12 gap-4">
      <section aria-label="Net sales" className="col-span-12 flex flex-col justify-between gap-6 rounded-[var(--radius-lg)] border border-ink bg-ink p-6 text-on-ink xl:col-span-5">
        <div>
          <p className="t-status opacity-65">Net sales</p>
          <p className="t-amount-hero mt-1 break-all">{m(r.net_sales)}</p>
        </div>
        <dl className="grid grid-cols-2 gap-4 border-t border-current/15 pt-4">
          <div>
            <dt className="t-meta opacity-70">Gross sales</dt>
            <dd className="t-amount mt-0.5 [overflow-wrap:anywhere]">{m(r.gross_sales)}</dd>
          </div>
          <div>
            <dt className="t-meta opacity-70">Refunds</dt>
            <dd className="t-amount mt-0.5 [overflow-wrap:anywhere]">{m(r.refunds)}</dd>
          </div>
        </dl>
      </section>

      {/* Four across only when each tile has room for a full amount; money never truncates. */}
      <div className="@container col-span-12 xl:col-span-7">
        <dl className="grid grid-cols-2 gap-3 @[52rem]:grid-cols-4">
          <Kpi label="Bills" value={String(r.order_count)} caption="settled" />
          <Kpi label="Average bill" value={m(r.average_order_value)} caption="gross ÷ bills" />
          <Kpi label="Guests" value={String(r.guests)} caption="on settled bills" />
          <Kpi label="Discounts" value={m(r.discounts_total)} caption={plural(r.discounted_bills, 'bill')} />
          <Kpi label="Cancelled" value={String(r.cancelled_orders)} caption={r.cancelled_orders === 1 ? 'order' : 'orders'} />
          <Kpi label="Voided items" value={m(r.voided_items_value)} caption="value at menu price" />
          <Kpi label="Taxes" value={m(r.tax_total)} caption="collected" />
          <Kpi label="Service charge" value={m(r.service_charge_total)} caption="collected" />
        </dl>
      </div>

      {empty ? (
        <Card flat className="col-span-12">
          <EmptyState icon={ChartLine} title="No sales in this period" message="Settled bills will appear here. Try a longer range." />
        </Card>
      ) : (
        <>
          {daily.bars.length > 1 && (
            <div className="col-span-12">
              <DailyChart series={daily} currency={cur} />
            </div>
          )}
          <div className="col-span-12">
            <HourlyChart bars={hourly.bars} peak={hourly.peak} currency={cur} />
          </div>

          <Panel title="Top sellers" subtitle="By quantity sold" className="lg:col-span-6">
            {sellers.length === 0 ? <Quiet>Nothing sold in this period.</Quiet> : (
              <RankList label="Top sellers" rows={sellers} currency={cur} caption={(row) => `${row.count} sold`} />
            )}
          </Panel>

          <Panel title="Payment methods" subtitle="Money taken, net of refunds" className="lg:col-span-6">
            {methods.length === 0 ? <Quiet>No payments in this period.</Quiet> : (
              <RankList label="Payment methods" rows={methods} currency={cur} caption={(row) => `${plural(row.count, 'payment')} · ${row.share ?? 0}%`} />
            )}
          </Panel>

          <section aria-labelledby="rep-tables" className="col-span-12 flex min-w-0 flex-col gap-3 lg:col-span-7">
            <h2 id="rep-tables" className="t-section text-fg">Tables</h2>
            {tables.length === 0 ? <Card flat><Quiet>No tables served in this period.</Quiet></Card> : (
              <DataTable caption="Tables by revenue">
                <thead>
                  <tr>
                    <Th>Table</Th>
                    <Th className="text-right">Checks</Th>
                    <Th className="text-right">Avg. time</Th>
                    <Th className="text-right">Revenue</Th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((t) => (
                    <Tr key={t.table_name}>
                      <Td className="t-body-strong">{t.table_name}</Td>
                      <Td className="text-right tabular-nums">{t.orders}</Td>
                      <Td className="text-right tabular-nums">{averageMinutes(t.average_minutes)}</Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-3">
                          <span aria-hidden className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-sunken sm:block">
                            <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, t.ratio * 100)}%` }} />
                          </span>
                          <span className="t-amount">{m(t.revenue)}</span>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>

          <Panel title="Staff" subtitle="Checks served and gross sales" className="lg:col-span-5">
            {staff.length === 0 ? <Quiet>No checks in this period.</Quiet> : (
              <RankList label="Staff" rows={staff} currency={cur} caption={(row) => `${plural(row.count, 'check')} · ${row.share ?? 0}%`} />
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3">
      <dt className="t-status text-fg3">{label}</dt>
      {/* Long amounts step down a size, then wrap; they are never cut off. */}
      <dd className={cn('t-amount-lg text-fg [overflow-wrap:anywhere]', value.length > 11 && 'text-[18px] leading-[24px]')}>{value}</dd>
      {caption && <dd className="t-meta text-fg2">{caption}</dd>}
    </div>
  )
}

function Panel({ title, subtitle, className, children }: { title: string; subtitle?: string; className?: string; children: ReactNode }) {
  return (
    <Card flat className={cn('col-span-12 flex min-w-0 flex-col gap-2 self-start p-5', className)}>
      <div>
        <h2 className="t-card-title text-fg">{title}</h2>
        {subtitle && <p className="t-support text-fg2">{subtitle}</p>}
      </div>
      {children}
    </Card>
  )
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="t-support px-1 py-4 text-fg2">{children}</p>
}
