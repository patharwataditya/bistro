import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ChevronDown, History, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { request } from '@/api/client'
import type { ApiError } from '@/api/errors'
import { auditQuery, keys } from '@/api/queries'
import type { AuditEntry, AuditPage as AuditPageData, Page, StaffMember } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { dateTime, relative } from '@/lib/format'
import { useServerNow } from '@/lib/live'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { cn } from '@/ui/cn'
import { ChipRow } from '@/ui/Controls'
import { SelectField, TextField } from '@/ui/Field'
import { PageHeader } from '@/ui/Page'
import { EmptyState, ErrorState, Skeleton, SkeletonList, StaleBanner } from '@/ui/States'
import { TONE } from '@/ui/tone'
import { AUDIT_CHIPS, chipByKey, dateRangeError, displayValue, humanize, toAuditQuery, type AuditScreenFilter } from './filters'
import { auditKind } from './kinds'

function useFilter(): [AuditScreenFilter, (patch: Partial<AuditScreenFilter>) => void] {
  const [params, setParams] = useSearchParams()
  const actor = Number(params.get('actor'))
  const filter: AuditScreenFilter = {
    chip: chipByKey(params.get('type')).key,
    actorId: Number.isInteger(actor) && actor > 0 ? actor : null,
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  }
  const update = (patch: Partial<AuditScreenFilter>) => {
    const next = { ...filter, ...patch }
    const p: Record<string, string> = {}
    if (next.chip !== 'all') p.type = next.chip
    if (next.actorId !== null) p.actor = String(next.actorId)
    if (next.from) p.from = next.from
    if (next.to) p.to = next.to
    setParams(p, { replace: true })
  }
  return [filter, update]
}

/** Everyone who could appear as an actor, deactivated staff included. Only with staff.view. */
function useActors(enabled: boolean) {
  return useQuery<Page<StaffMember>, ApiError>({
    queryKey: keys.users('audit-actors'),
    queryFn: ({ signal }) => request<Page<StaffMember>>('/users', { query: { include_inactive: true, limit: 200 }, signal }),
    enabled,
    staleTime: 60_000,
  })
}

export default function AuditPage() {
  const { me, can } = useMe()
  const zone = me.location.timezone
  const [filter, setFilter] = useFilter()
  const apiFilter = useMemo(() => toAuditQuery(filter, zone), [filter, zone])
  const canStaff = can(P.STAFF_VIEW)
  const actors = useActors(canStaff)

  const query = useInfiniteQuery<AuditPageData, ApiError, { pages: AuditPageData[] }, readonly unknown[], number | null>({
    queryKey: keys.audit(JSON.stringify(apiFilter)),
    queryFn: ({ pageParam }) => auditQuery(apiFilter, pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_before_id ?? undefined,
    refetchInterval: 30_000,
  })

  const entries = useMemo(() => {
    const seen = new Set<number>()
    const out: AuditEntry[] = []
    for (const page of query.data?.pages ?? []) {
      for (const e of page.items) {
        if (!seen.has(e.id)) {
          seen.add(e.id)
          out.push(e)
        }
      }
    }
    return out
  }, [query.data])

  const chip = chipByKey(filter.chip)
  const filtered = chip.prefix !== null || filter.actorId !== null || filter.from !== '' || filter.to !== ''
  const rangeErr = dateRangeError(filter.from, filter.to)

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <PageHeader eyebrow={me.restaurant_name} title="Audit log" subtitle="Who did what, when" />

      <div className="flex flex-col gap-3">
        <ChipRow
          ariaLabel="Activity type"
          options={AUDIT_CHIPS}
          value={chip}
          keyOf={(c) => c.key}
          label={(c) => c.label}
          onChange={(c) => setFilter({ chip: c.key })}
        />
        <div className="flex flex-wrap items-start gap-3">
          {canStaff && (
            <SelectField
              label="Person"
              value={filter.actorId ?? ''}
              onChange={(e) => setFilter({ actorId: e.target.value ? Number(e.target.value) : null })}
              wrapperClassName="w-full sm:w-[240px]"
              disabled={!actors.data}
            >
              <option value="">Everyone</option>
              {(actors.data?.items ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}{u.is_active ? '' : ' (deactivated)'}</option>
              ))}
            </SelectField>
          )}
          <TextField label="From" type="date" value={filter.from} max={filter.to || undefined} onChange={(e) => setFilter({ from: e.target.value })} wrapperClassName="w-[calc(50%-6px)] sm:w-[180px]" />
          <TextField label="To" type="date" value={filter.to} min={filter.from || undefined} onChange={(e) => setFilter({ to: e.target.value })} wrapperClassName="w-[calc(50%-6px)] sm:w-[180px]" error={rangeErr} />
          {filtered && (
            <Button variant="ghost" icon={X} className="mt-[22px]" onClick={() => setFilter({ chip: 'all', actorId: null, from: '', to: '' })}>
              Clear filters
            </Button>
          )}
        </div>
        <p className="t-meta text-fg3">Dates are in restaurant time ({zone}).</p>
      </div>

      {query.isError && query.data && !query.isFetchNextPageError && <StaleBanner error={query.error} />}

      {!query.data ? (
        query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <SkeletonList rows={8} />
      ) : entries.length === 0 ? (
        <Card flat>
          <EmptyState
            icon={History}
            title={filtered ? (chip.prefix ? `No ${chip.label.toLowerCase()} activity` : 'Nothing matches') : 'Nothing recorded yet'}
            message={filtered ? 'Nothing matches these filters. Clear them to see everything.' : 'Important actions (voids, refunds, price and access changes) are logged here.'}
            action={filtered ? <Button variant="secondary" onClick={() => setFilter({ chip: 'all', actorId: null, from: '', to: '' })}>Clear filters</Button> : undefined}
          />
        </Card>
      ) : (
        <AuditList
          entries={entries}
          zone={zone}
          hasMore={query.hasNextPage}
          loadingMore={query.isFetchingNextPage}
          moreError={query.isFetchNextPageError ? query.error : null}
          onMore={() => void query.fetchNextPage()}
        />
      )}
    </div>
  )
}

function AuditList({ entries, zone, hasMore, loadingMore, moreError, onMore }: {
  entries: AuditEntry[]
  zone: string
  hasMore: boolean
  loadingMore: boolean
  moreError: ApiError | null
  onMore: () => void
}) {
  const now = useServerNow(undefined, 30_000)
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const sentinel = useRef<HTMLDivElement>(null)
  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Load the next page as the end of the list scrolls into view (the button remains for keyboards).
  const canAuto = hasMore && !loadingMore && !moreError
  useEffect(() => {
    const el = sentinel.current
    if (!el || !canAuto || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((items) => {
      if (items.some((i) => i.isIntersecting)) onMore()
    }, { rootMargin: '400px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [canAuto, onMore])

  return (
    <div className="flex flex-col gap-3">
      <Card flat className="overflow-hidden">
        <ul>
          {entries.map((e) => (
            <AuditRow key={e.id} entry={e} zone={zone} now={now} expanded={open.has(e.id)} onToggle={() => toggle(e.id)} />
          ))}
        </ul>
      </Card>
      <div ref={sentinel} />
      {loadingMore ? (
        <div role="status" aria-label="Loading older entries" className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : hasMore ? (
        <div className="flex flex-col items-center gap-2 py-2">
          {moreError && <p role="alert" className="t-support text-fg2">{moreError.message}</p>}
          <Button variant="secondary" onClick={onMore}>Load older</Button>
        </div>
      ) : (
        <p className="t-meta py-3 text-center text-fg3">That's the beginning of the log.</p>
      )}
    </div>
  )
}

function AuditRow({ entry, zone, now, expanded, onToggle }: { entry: AuditEntry; zone: string; now: number; expanded: boolean; onToggle: () => void }) {
  const kind = auditKind(entry.action, entry.entity_type)
  const panelId = useId()
  const meta = Object.entries(entry.metadata ?? {})
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--hover-overlay)] focus-visible:rounded-none sm:px-5"
      >
        <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]', TONE[kind.tone].bg, TONE[kind.tone].fg)}>
          <kind.icon aria-hidden className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="t-body-strong block text-fg">{entry.summary}</span>
          <span className="t-meta block text-fg2">
            {entry.actor_name ?? 'System'}
            <span className="text-fg3"> · {entry.action}</span>
          </span>
        </span>
        <time dateTime={entry.created_at} title={dateTime(entry.created_at, zone)} className="t-meta shrink-0 pt-0.5 text-fg3">
          {relative(entry.created_at, now, zone)}
        </time>
        <ChevronDown aria-hidden className={cn('mt-0.5 size-5 shrink-0 text-fg3 transition-transform duration-200', expanded && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <dl className="mx-4 mb-4 grid grid-cols-[minmax(110px,max-content)_1fr] gap-x-6 gap-y-1.5 rounded-[var(--radius-md)] border border-line bg-sunken px-4 py-3 sm:mx-5 sm:ml-[68px]">
              <Detail label="When" value={dateTime(entry.created_at, zone)} />
              <Detail label="Action" value={entry.action} mono />
              {entry.entity_id !== null && <Detail label={humanize(entry.entity_type)} value={`#${entry.entity_id}`} mono />}
              {meta.map(([k, v]) => <Detail key={k} label={humanize(k)} value={displayValue(v)} mono={typeof v === 'object' && v !== null} />)}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="t-meta py-0.5 text-fg3">{label}</dt>
      <dd className={cn('t-support min-w-0 py-0.5 break-words whitespace-pre-wrap text-fg', mono && 'font-mono text-[12px]')}>{value}</dd>
    </>
  )
}
