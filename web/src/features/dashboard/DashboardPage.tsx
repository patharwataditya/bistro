import { ArrowUpRight, ChefHat, ChevronRight, ClipboardList, LayoutDashboard, ReceiptText, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useDashboard } from '@/api/queries'
import type { Dashboard } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe, useSession } from '@/auth/session'
import { dateTime, minutesSince, money, plural, relative } from '@/lib/format'
import { useServerNow } from '@/lib/live'
import { Card } from '@/ui/Card'
import { cn } from '@/ui/cn'
import { PageHeader } from '@/ui/Page'
import { EmptyState, ErrorState, Skeleton, StaleBanner } from '@/ui/States'
import { tableVisual, urgencyFor } from '@/ui/status'
import { TONE, type Tone } from '@/ui/tone'
import { auditKind } from '@/features/audit/kinds'
import { greeting, longDate } from './greeting'
import { RollingValue } from './RollingValue'

type Tables = NonNullable<Dashboard['tables']>

export default function DashboardPage() {
  const { me } = useMe()
  const { reloadProfile } = useSession()
  const query = useDashboard()
  const d = query.data
  const zone = me.location.timezone
  // A 403 means this person's access changed since sign-in: refresh the profile (the route gate
  // and navigation follow it) and stop showing figures they may no longer see.
  const forbidden = query.error?.kind === 'forbidden'
  useEffect(() => {
    if (forbidden) void reloadProfile()
  }, [forbidden, reloadProfile])

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <PageHeader
        eyebrow={me.restaurant_name}
        title={greeting(me.full_name, zone)}
        subtitle={d ? `${longDate(d.business_date)} · ${me.location.name}` : me.location.name}
      />
      {query.isError && d && !forbidden && <StaleBanner error={query.error} />}
      {forbidden && query.error ? (
        <ErrorState error={query.error} />
      ) : !d ? (
        query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <DashboardSkeleton />
      ) : (
        <DashboardContent d={d} />
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="grid grid-cols-12 gap-4">
      <Skeleton className="col-span-12 h-[176px] lg:col-span-5" />
      <Skeleton className="col-span-12 h-[176px] lg:col-span-7" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="col-span-12 h-[132px] md:col-span-4" />)}
      <Skeleton className="col-span-12 h-[260px]" />
    </div>
  )
}

const SPAN: Record<number, string> = { 1: 'md:col-span-12', 2: 'md:col-span-6', 3: 'md:col-span-4' }

function DashboardContent({ d }: { d: Dashboard }) {
  const { can, me } = useMe()
  const now = useServerNow(d.server_time, 15_000)
  const cur = d.currency_code

  const tiles: ReactNode[] = []
  if (d.kitchen) {
    const k = d.kitchen
    const oldest = k.oldest_active_fired_at ? minutesSince(k.oldest_active_fired_at, now) : null
    const urgency = oldest !== null ? urgencyFor(oldest) : null
    tiles.push(
      <MetricTile
        key="kitchen"
        icon={ChefHat}
        label="Kitchen"
        value={String(k.new + k.preparing)}
        to={can(P.KITCHEN_VIEW) ? '/kitchen' : null}
        caption={`${k.new} new · ${k.preparing} cooking${k.ready > 0 ? ` · ${k.ready} at the pass` : ''}`}
        flag={urgency && oldest !== null ? { text: `Oldest ${oldest}m · ${urgency.label}`, tone: urgency.tone } : null}
        valueTone={urgency && urgency.tone !== 'neutral' ? urgency.tone : null}
      />,
    )
  }
  if (d.open_orders !== null) {
    const ready = d.ready_items ?? 0
    tiles.push(
      <MetricTile
        key="orders"
        icon={ClipboardList}
        label="Orders"
        value={String(d.open_orders)}
        to={can(P.ORDERS_VIEW) ? '/orders' : can(P.TABLES_VIEW) ? '/floor' : null}
        caption={d.open_orders === 1 ? 'open check' : 'open checks'}
        flag={ready > 0 ? { text: `${plural(ready, 'item')} ready to serve`, tone: 'success' } : null}
      />,
    )
  }
  if (d.open_bills !== null) {
    tiles.push(
      <MetricTile
        key="bills"
        icon={ReceiptText}
        label="Bills awaiting payment"
        value={String(d.open_bills)}
        to={can(P.BILLING_VIEW) ? '/bills' : null}
        caption={d.open_bills_amount !== null ? `${money(d.open_bills_amount, cur)} outstanding` : ''}
        valueTone={d.open_bills > 0 ? 'warning' : null}
      />,
    )
  }

  const nothing = !d.sales_today && !d.tables && tiles.length === 0 && !d.recent_activity
  if (nothing) {
    return (
      <Card flat>
        <EmptyState icon={LayoutDashboard} title="Nothing to show here" message="Your role doesn't include any dashboard figures." />
      </Card>
    )
  }

  const heroSpan = d.tables ? 'lg:col-span-5' : 'lg:col-span-12'
  const floorSpan = d.sales_today ? 'lg:col-span-7' : 'lg:col-span-12'

  return (
    <div className="grid grid-cols-12 gap-4">
      {d.sales_today && (
        <SalesHero
          className={cn('col-span-12', heroSpan)}
          net={money(d.sales_today.net_sales, cur)}
          caption={`${plural(d.sales_today.paid_bills, 'paid bill')} · average ${money(d.sales_today.average_bill, cur)}`}
          to={can(P.REPORTS_VIEW) ? '/reports' : null}
        />
      )}
      {d.tables && <FloorCard className={cn('col-span-12', floorSpan)} t={d.tables} to={can(P.TABLES_VIEW) ? '/floor' : null} />}
      {tiles.map((tile, i) => (
        <div key={i} className={cn('col-span-12 flex', SPAN[tiles.length])}>{tile}</div>
      ))}
      {d.recent_activity && (
        <section aria-labelledby="dash-activity" className="col-span-12 mt-2 flex flex-col gap-3">
          <div className="flex items-end gap-4">
            <h2 id="dash-activity" className="t-section flex-1 text-fg">Recent activity</h2>
            {can(P.AUDIT_LOGS_VIEW) && (
              <Link to="/audit" className="t-meta inline-flex h-10 items-center gap-1 rounded-full px-3 font-semibold text-fg2 hover:bg-[var(--hover-overlay)] hover:text-fg">
                See all <ChevronRight aria-hidden className="size-4" />
              </Link>
            )}
          </div>
          {d.recent_activity.length === 0 ? (
            <Card flat className="px-5 py-6">
              <p className="t-support text-fg2">No activity yet.</p>
            </Card>
          ) : (
            <Card flat className="px-2 py-1">
              <ul>
                {d.recent_activity.map((a) => {
                  const kind = auditKind(a.action)
                  return (
                    <li key={a.id} className="flex items-start gap-3 border-b border-line px-3 py-3 last:border-b-0">
                      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)]', TONE[kind.tone].bg, TONE[kind.tone].fg)}>
                        <kind.icon aria-hidden className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="t-body text-fg">{a.summary}</p>
                        <p className="t-meta text-fg3">
                          {a.actor_name ?? 'System'} · <time dateTime={a.created_at} title={dateTime(a.created_at, me.location.timezone)}>{relative(a.created_at, now, me.location.timezone)}</time>
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </section>
      )}
    </div>
  )
}

/** Card that becomes a link only when the user may open the page behind it. */
function TileShell({ to, label, className, ink, children }: { to: string | null; label: string; className?: string; ink?: boolean; children: ReactNode }) {
  const base = cn(
    'group relative flex w-full min-w-0 flex-col rounded-[var(--radius-lg)] border p-5',
    ink ? 'border-ink bg-ink text-on-ink' : 'border-line bg-surface shadow-card',
    className,
  )
  if (!to) return <div className={base}>{children}</div>
  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(base, 'transition-[transform,background-color,filter] duration-150 active:scale-[0.99]', ink ? 'hover:brightness-110' : 'hover:bg-[color-mix(in_srgb,var(--surface)_92%,var(--text-primary))]')}
    >
      {children}
      <ArrowUpRight aria-hidden className={cn('absolute top-4 right-4 size-4 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60')} />
    </Link>
  )
}

function SalesHero({ net, caption, to, className }: { net: string; caption: string; to: string | null; className?: string }) {
  return (
    <TileShell to={to} ink label={`Today's net sales ${net}. ${caption}. Open reports`} className={cn('justify-between gap-6 p-6', className)}>
      <p className="t-status opacity-65">Today's net sales</p>
      <div>
        <RollingValue value={net} className="t-amount-hero" />
        <p className="t-support mt-1 opacity-75">{caption}</p>
      </div>
    </TileShell>
  )
}

function MetricHeader({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <p className="t-status flex items-center gap-2 text-fg3">
      <Icon aria-hidden className="size-4" />
      {label}
    </p>
  )
}

const FLOOR_PARTS = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'BLOCKED'] as const
const FLOOR_COUNT: Record<(typeof FLOOR_PARTS)[number], keyof Tables> = {
  AVAILABLE: 'available', OCCUPIED: 'occupied', RESERVED: 'reserved', CLEANING: 'cleaning', BLOCKED: 'blocked',
}

function FloorCard({ t, to, className }: { t: Tables; to: string | null; className?: string }) {
  const parts = FLOOR_PARTS.map((s) => ({ status: s, count: t[FLOOR_COUNT[s]], visual: tableVisual(s) })).filter((p) => p.count > 0)
  const description = parts.map((p) => `${p.count} ${p.visual.label.toLowerCase()}`).join(', ')
  return (
    <TileShell to={to} label={`Floor: ${t.available} of ${t.total} tables free. ${description}. Open the floor`} className={cn('gap-4', className)}>
      <MetricHeader icon={UtensilsCrossed} label="Floor" />
      <p className="flex items-baseline gap-2">
        <RollingValue value={String(t.available)} className="t-metric text-fg" />
        <span className="t-support text-fg2">of {plural(t.total, 'table')} free</span>
      </p>
      {t.total > 0 ? (
        <div className="mt-auto flex flex-col gap-3">
          <div aria-hidden className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-sunken">
            {parts.map((p) => (
              <span
                key={p.status}
                className={cn('h-full transition-[flex-grow] duration-300 ease-[var(--ease-standard)] first:rounded-l-full last:rounded-r-full', TONE[p.visual.tone].stripe)}
                style={{ flexGrow: p.count, flexBasis: 0 }}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {parts.map((p) => (
              <li key={p.status} className="t-meta flex items-center gap-1.5 text-fg2">
                <p.visual.icon aria-hidden className={cn('size-3.5', TONE[p.visual.tone].fg)} />
                <span className="text-fg">{p.count}</span> {p.visual.label}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="t-support text-fg2">No tables set up yet.</p>
      )}
    </TileShell>
  )
}

function MetricTile({ icon, label, value, caption, to, flag, valueTone }: {
  icon: LucideIcon
  label: string
  value: string
  caption: string
  to: string | null
  flag?: { text: string; tone: Tone } | null
  valueTone?: Tone | null
}) {
  return (
    <TileShell to={to} label={`${label}: ${value}. ${caption}${flag ? `. ${flag.text}` : ''}`} className="gap-1">
      <MetricHeader icon={icon} label={label} />
      <RollingValue value={value} className={cn('t-metric mt-2', valueTone ? TONE[valueTone].fg : 'text-fg')} />
      <p className="t-meta text-fg2">{caption}</p>
      {flag && (
        <p className={cn('t-meta mt-2 inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1 font-semibold', TONE[flag.tone].bg, TONE[flag.tone].fg)}>
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {flag.text}
        </p>
      )}
    </TileShell>
  )
}
