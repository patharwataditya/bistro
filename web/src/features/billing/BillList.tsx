import { ChevronLeft, ChevronRight, CircleCheck, CircleMinus, ReceiptText } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useBills } from '@/api/queries'
import type { BillSummary } from '@/api/types'
import { useMe } from '@/auth/session'
import { useServerNow } from '@/lib/live'
import { money, relative } from '@/lib/format'
import { IconButton } from '@/ui/Button'
import { StatusChip } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { Segmented } from '@/ui/Controls'
import { PageHeader } from '@/ui/Page'
import { billVisual } from '@/ui/status'
import { EmptyState, ErrorState, SkeletonList, StaleBanner } from '@/ui/States'
import { BILL_FILTERS, FILTER_LABEL, FILTER_STATUSES, fromCents, localMidnightIso, toCents, type BillFilter } from './billMath'

export const PAGE_SIZE = 50

function readFilter(value: string | null): BillFilter {
  return (BILL_FILTERS as readonly string[]).includes(value ?? '') ? (value as BillFilter) : 'open'
}

/** Filter and page live in the query string, so opening a bill keeps the list where it was. */
export function useBillListParams() {
  const [params] = useSearchParams()
  const filter = readFilter(params.get('filter'))
  const page = Math.max(0, Math.floor(Number(params.get('page') ?? '0')) || 0)
  return { filter, page, search: params.toString() }
}

export function BillList({ selectedId }: { selectedId: number | null }) {
  const { me } = useMe()
  const navigate = useNavigate()
  const [, setParams] = useSearchParams()
  const { filter, page, search } = useBillListParams()
  const zone = me.location.timezone
  const currency = me.location.currency_code
  // Re-read each minute: relative times stay fresh and "Paid today" rolls over at local midnight.
  const now = useServerNow(undefined, 60_000)
  const paidSince = filter === 'paid' ? localMidnightIso(zone, now) : null
  const query = useBills(FILTER_STATUSES[filter], paidSince, page * PAGE_SIZE, PAGE_SIZE)
  const data = query.data
  const bills = data?.items ?? []
  // A page from the previous filter is kept while the new one loads; don't show it as this one.
  const showingPrevious = query.isPlaceholderData

  const select = (next: BillFilter) => setParams(next === 'open' ? {} : { filter: next }, { replace: true })
  const goPage = (p: number) => setParams({ ...(filter === 'open' ? {} : { filter }), ...(p > 0 ? { page: String(p) } : {}) }, { replace: true })

  const listRef = useRef<HTMLUListElement>(null)
  useLayoutEffect(() => {
    listRef.current?.scrollTo?.({ top: 0 })
  }, [filter, page])

  return (
    <>
      <PageHeader eyebrow={me.location.name} title="Bills" subtitle={data && !showingPrevious ? summary(filter, data.total, bills, currency) : ' '} className="pb-4" />
      <Segmented ariaLabel="Bill filters" options={BILL_FILTERS} value={filter} onChange={select} label={(f) => FILTER_LABEL[f]} />
      <StaleBanner error={query.isError && data ? query.error : null} className="mt-3" />

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        {query.isPending ? (
          <SkeletonList rows={6} />
        ) : query.isError && !data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : bills.length === 0 && !showingPrevious ? (
          <BillsEmpty filter={filter} />
        ) : (
          <>
            <ul ref={listRef} aria-label={`${FILTER_LABEL[filter]} bills`} aria-busy={showingPrevious || undefined}
              className={cn('flex min-h-0 flex-col gap-2 pb-4 lg:flex-1 lg:overflow-y-auto lg:px-1 lg:pt-1', showingPrevious && 'opacity-60')}>
              {bills.map((b) => (
                <li key={b.id}>
                  <BillCard
                    bill={b}
                    selected={b.id === selectedId}
                    now={now}
                    zone={zone}
                    currency={currency}
                    onOpen={() => navigate({ pathname: `/bills/${b.id}`, search: search ? `?${search}` : '' })}
                  />
                </li>
              ))}
            </ul>
            {data && data.total > PAGE_SIZE && (
              <Pager offset={data.offset} count={bills.length} total={data.total} onPrev={() => goPage(page - 1)} onNext={() => goPage(page + 1)} />
            )}
          </>
        )}
      </div>
    </>
  )
}

function summary(filter: BillFilter, total: number, bills: BillSummary[], currency: string): string {
  const complete = total <= bills.length
  const sum = (pick: (b: BillSummary) => string) => fromCents(bills.reduce((acc, b) => acc + toCents(pick(b)), 0n))
  switch (filter) {
    case 'open':
      return complete ? `${total} open · ${money(sum((b) => b.balance_due), currency)} outstanding` : `${total} open`
    case 'paid':
      return complete ? `${total} settled · ${money(sum((b) => b.total), currency)} billed` : `${total} settled`
    case 'void':
      return `${total} voided`
  }
}

function BillsEmpty({ filter }: { filter: BillFilter }) {
  switch (filter) {
    case 'open':
      return (
        <EmptyState icon={ReceiptText} title="No bills waiting"
          message="Every issued bill has been settled. Bills issued from a check appear here until they're paid." />
      )
    case 'paid':
      return <EmptyState icon={CircleCheck} title="Nothing settled yet today" message="Bills appear here as soon as they're paid in full." />
    case 'void':
      return <EmptyState icon={CircleMinus} title="No voided bills" message="Voided bills are kept here for the record." />
  }
}

function BillCard({ bill, selected, now, zone, currency, onOpen }: {
  bill: BillSummary
  selected: boolean
  now: number
  zone: string
  currency: string
  onOpen: () => void
}) {
  const v = billVisual(bill.status)
  const open = bill.status === 'OPEN'
  const partlyPaid = open && toCents(bill.balance_due) < toCents(bill.total)
  const whenText = relative(bill.paid_at ?? bill.created_at, now, zone)
  const headline = open ? bill.balance_due : bill.total
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'group relative flex w-full items-center gap-4 rounded-[var(--radius-lg)] border p-4 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.99]',
        selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong hover:bg-[var(--hover-overlay)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="t-identifier text-fg2">{bill.bill_number}</div>
        <div className="t-card-title truncate text-fg">Table {bill.table_name}</div>
        <div className="t-meta truncate text-fg3">Check #{bill.order_number} · {whenText}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={cn(open ? 't-amount-lg' : 't-amount', bill.status === 'VOID' ? 'text-fg3 line-through' : 'text-fg')}>
          <span className="sr-only">{open ? 'Balance due ' : 'Total '}</span>
          {money(headline, currency)}
        </span>
        {partlyPaid && <span className="t-meta text-fg2">due of {money(bill.total, currency)}</span>}
        {open && !partlyPaid && <span className="sr-only">Total {money(bill.total, currency)}</span>}
        <StatusChip label={v.label} tone={v.tone} icon={v.icon} />
      </div>
    </button>
  )
}

function Pager({ offset, count, total, onPrev, onNext }: { offset: number; count: number; total: number; onPrev: () => void; onNext: () => void }) {
  return (
    <nav aria-label="Pages" className="flex items-center gap-2 border-t border-line pt-3 pb-2">
      <span className="t-meta flex-1 text-fg2">
        {offset + 1}–{offset + count} of {total}
      </span>
      <IconButton icon={ChevronLeft} label="Previous page" onClick={onPrev} disabled={offset === 0} />
      <IconButton icon={ChevronRight} label="Next page" onClick={onNext} disabled={offset + count >= total} />
    </nav>
  )
}
