import { ChevronLeft, ChevronRight, ReceiptText } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useOrders } from '@/api/queries'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { money, relative } from '@/lib/format'
import { useServerNow } from '@/lib/live'
import { Button } from '@/ui/Button'
import { StatusChip } from '@/ui/Chip'
import { Segmented } from '@/ui/Controls'
import { PageHeader } from '@/ui/Page'
import { EmptyState, ErrorState, SkeletonList, StaleBanner } from '@/ui/States'
import { orderVisual } from '@/ui/status'
import { DataTable, Td, Th, Tr } from '@/ui/Table'

const FILTERS = ['active', 'closed', 'cancelled'] as const
type Filter = (typeof FILTERS)[number]

const FILTER: Record<Filter, { label: string; statuses: readonly string[]; empty: string }> = {
  active: { label: 'Active', statuses: ['OPEN', 'BILLED'], empty: 'Seat a table from the floor to start a check.' },
  closed: { label: 'Closed', statuses: ['CLOSED'], empty: 'Paid checks will show up here.' },
  cancelled: { label: 'Cancelled', statuses: ['CANCELLED', 'MERGED'], empty: 'Nothing has been cancelled. Good.' },
}

const PAGE_SIZE = 50

export default function OrdersPage() {
  const { me, can } = useMe()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const raw = params.get('filter')
  const filter: Filter = raw === 'closed' || raw === 'cancelled' ? raw : 'active'
  const page = Math.max(0, Number(params.get('page') ?? '1') - 1 || 0)
  const query = useOrders(FILTER[filter].statuses, page * PAGE_SIZE, PAGE_SIZE)
  const now = useServerNow(undefined, 30_000)
  const zone = me.location.timezone
  const currency = me.location.currency_code
  const data = query.data

  const go = (next: { filter?: Filter; page?: number }) => {
    const p = new URLSearchParams(params)
    const f = next.filter ?? filter
    if (f === 'active') p.delete('filter')
    else p.set('filter', f)
    const pg = next.filter !== undefined ? 0 : (next.page ?? page)
    if (pg === 0) p.delete('page')
    else p.set('page', String(pg + 1))
    setParams(p, { replace: next.filter !== undefined })
  }

  const total = data?.total ?? 0
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * PAGE_SIZE)

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader eyebrow={me.location.name} title="Orders" subtitle="Active and recent checks" />
      <Segmented
        ariaLabel="Orders"
        options={FILTERS}
        value={filter}
        onChange={(f) => go({ filter: f })}
        label={(f) => FILTER[f].label}
        className="mb-5 max-w-md"
      />
      {query.isPending ? (
        <SkeletonList rows={8} />
      ) : !data ? (
        <ErrorState error={query.error ?? new Error('Couldn’t load orders.')} onRetry={() => void query.refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          <StaleBanner error={query.isError ? query.error : null} />
          {data.items.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title={`No ${FILTER[filter].label.toLowerCase()} orders`}
              message={FILTER[filter].empty}
              action={filter === 'active' && can(P.TABLES_VIEW) ? <Button variant="secondary" onClick={() => navigate('/floor')}>Go to the floor</Button> : undefined}
            />
          ) : (
            <>
              <DataTable caption={`${FILTER[filter].label} orders`}>
                <thead>
                  <tr>
                    <Th>Table</Th>
                    <Th>Check</Th>
                    <Th className="text-right">Guests</Th>
                    <Th>Server</Th>
                    <Th>Opened</Th>
                    <Th className="text-right">Items</Th>
                    <Th className="text-right">Subtotal</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
                  {data.items.map((o) => {
                    const v = orderVisual(o.status)
                    return (
                      <Tr key={o.id} interactive onClick={() => navigate(`/orders/${o.id}`)}>
                        <Td className="font-semibold whitespace-nowrap">
                          <Link to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="rounded-sm hover:underline" aria-label={`Table ${o.table_name}, check ${o.order_number}`}>
                            {o.table_name}
                          </Link>
                        </Td>
                        <Td className="t-identifier whitespace-nowrap text-fg2">#{o.order_number}</Td>
                        <Td className="text-right tabular-nums">{o.guest_count}</Td>
                        <Td className="whitespace-nowrap">{o.server_name}</Td>
                        <Td className="whitespace-nowrap text-fg2 tabular-nums" title={o.opened_at}>{relative(o.opened_at, now, zone)}</Td>
                        <Td className="text-right tabular-nums">{o.item_count}</Td>
                        <Td className="t-amount text-right whitespace-nowrap">{money(o.subtotal, currency)}</Td>
                        <Td><StatusChip label={v.label} tone={v.tone} icon={v.icon} /></Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </DataTable>
              <nav aria-label="Pages" className="flex items-center gap-2">
                <span className="t-meta mr-auto text-fg3" aria-live="polite">{from}–{to} of {total}</span>
                <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page === 0} onClick={() => go({ page: page - 1 })}>Newer</Button>
                <Button variant="secondary" size="sm" disabled={to >= total} onClick={() => go({ page: page + 1 })}>
                  Older <ChevronRight aria-hidden className="-mr-1 inline size-[18px] align-[-4px]" />
                </Button>
              </nav>
            </>
          )}
        </div>
      )}
    </div>
  )
}
