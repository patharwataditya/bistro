import { ArrowUp, ChevronDown, History, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router'
import type { ApiError } from '@/api/errors'
import type { AuditEntry } from '@/api/types'
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
import { useAuditActors, useAuditLog } from './api'
import { AUDIT_CHIPS, chipByKey, dateError, dateRangeError, displayValue, humanize, isCommittableDate, toAuditQuery, type AuditScreenFilter } from './filters'
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

export default function AuditPage() {
  const { me, can } = useMe()
  const zone = me.location.timezone
  const [filter, setFilter] = useFilter()
  const apiFilter = useMemo(() => toAuditQuery(filter, zone), [filter, zone])
  const canStaff = can(P.STAFF_VIEW)
  const actors = useAuditActors(canStaff)
  const { list: query, head, entries, newerHidden, showNewer } = useAuditLog(apiFilter)

  const chip = chipByKey(filter.chip)
  const filtered = chip.prefix !== null || filter.actorId !== null || filter.from !== '' || filter.to !== ''
  const rangeErr = dateRangeError(filter.from, filter.to)
  // A person filtered by link (or deactivated and not in the list) still shows who it is.
  const actorKnown = filter.actorId === null || (actors.data?.items ?? []).some((u) => u.id === filter.actorId)
  const actorFallback = filter.actorId !== null && !actorKnown
    ? entries.find((e) => e.actor_id === filter.actorId)?.actor_name ?? `Person #${filter.actorId}`
    : null
  const staleError = query.isError && query.data && !query.isFetchNextPageError ? query.error : head.isError && head.data ? head.error : null

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
              {actorFallback !== null && <option value={filter.actorId ?? ''}>{actorFallback}</option>}
              {(actors.data?.items ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}{u.is_active ? '' : ' (deactivated)'}</option>
              ))}
            </SelectField>
          )}
          <DateFilter label="From" value={filter.from} min="2000-01-01" max={filter.to || undefined} onCommit={(from) => setFilter({ from })} />
          <DateFilter label="To" value={filter.to} min={filter.from || '2000-01-01'} onCommit={(to) => setFilter({ to })} error={rangeErr} />
          {filtered && (
            <Button variant="ghost" icon={X} className="mt-[22px]" onClick={() => setFilter({ chip: 'all', actorId: null, from: '', to: '' })}>
              Clear filters
            </Button>
          )}
        </div>
        <p className="t-meta text-fg3">Dates are in restaurant time ({zone}).</p>
      </div>

      {staleError && <StaleBanner error={staleError} />}
      {newerHidden && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] bg-info-soft px-3 py-2 text-info">
          <span className="t-meta flex-1">New activity has been recorded.</span>
          <Button variant="secondary" icon={ArrowUp} onClick={showNewer}>Show new activity</Button>
        </div>
      )}

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
        // The card clips anything drawn outside a row, so the focus ring is drawn inside it.
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--hover-overlay)] focus-visible:rounded-none focus-visible:shadow-[inset_0_0_0_2px_var(--accent)] sm:px-5"
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

/**
 * A date filter that only reaches the URL (and the API) once a date is complete: typing a year
 * digit by digit passes through dates like 0002-09-28, which are held back until the field
 * leaves focus or Enter is pressed. Picking from the calendar applies straight away.
 */
function DateFilter({ label, value, min, max, error, onCommit }: {
  label: string
  value: string
  min?: string
  max?: string
  error?: string | null
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [shown, setShown] = useState(value)
  const [blurred, setBlurred] = useState(false)
  // Follow the URL when it changes elsewhere (Clear filters, back/forward).
  if (value !== shown) {
    setShown(value)
    setDraft(value)
  }
  const draftError = dateError(draft)
  const commit = () => {
    setBlurred(true)
    if (draft !== value && draftError === null) onCommit(draft)
  }
  return (
    <TextField
      label={label}
      type="date"
      value={draft}
      min={min}
      max={max}
      onChange={(e) => {
        const next = e.target.value
        setDraft(next)
        setBlurred(false)
        if (isCommittableDate(next) && next !== value) onCommit(next)
      }}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && commit()}
      wrapperClassName="w-[calc(50%-6px)] sm:w-[180px]"
      error={(blurred ? draftError : null) ?? error}
    />
  )
}
