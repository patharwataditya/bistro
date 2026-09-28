import { LayoutGrid, SlidersHorizontal } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useFloor } from '@/api/queries'
import { isKnown, TABLE_STATUSES, type DiningTable, type TableStatus } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { WIDE, useMediaQuery } from '@/features/orders/useMediaQuery'
import { useServerNow } from '@/lib/live'
import { IconButton } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { ChipRow } from '@/ui/Controls'
import { PageHeader } from '@/ui/Page'
import { EmptyState, ErrorState, Skeleton, StaleBanner } from '@/ui/States'
import { tableVisual } from '@/ui/status'
import { TONE } from '@/ui/tone'
import {
  areaFromKey, areaKey, areaOptions, filterTables, freeSummary, groupTables, isSeatable, statusCounts,
  SUMMARY_STATUSES, type AreaFilter,
} from './floorModel'
import { TableCard } from './TableCard'
import { TablePanel } from './TablePanel'

export default function FloorPage() {
  const { me, can } = useMe()
  const navigate = useNavigate()
  const floor = useFloor()
  const data = floor.data
  const now = useServerNow(data?.server_time, 15_000)
  const wide = useMediaQuery(WIDE)
  const [params, setParams] = useSearchParams()
  const [panelFor, setPanelFor] = useState<number | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const currency = me.location.currency_code
  const canSeat = can(P.ORDERS_CREATE)

  const options = useMemo(() => (data ? areaOptions(data.areas, data.tables) : []), [data])
  const area = areaFromKey(params.get('area'), options)
  const statusParam = params.get('status')
  const status: TableStatus | null = statusParam && isKnown(TABLE_STATUSES, statusParam) ? statusParam : null

  const setFilter = (next: { area?: AreaFilter; status?: TableStatus | null }) => {
    const p = new URLSearchParams(params)
    if (next.area !== undefined) {
      if (next.area.kind === 'all') p.delete('area')
      else p.set('area', areaKey(next.area))
    }
    if (next.status !== undefined) {
      if (next.status === null) p.delete('status')
      else p.set('status', next.status)
    }
    setParams(p, { replace: true })
  }

  // The panel always shows the latest poll of its table.
  const panelTable = panelFor !== null ? (data?.tables.find((t) => t.id === panelFor) ?? null) : null

  const openPanel = (table: DiningTable) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPanelFor(table.id)
  }
  // The panel has no trigger element, so hand focus back to the card once it has closed.
  const closePanel = () => {
    setPanelFor(null)
    const el = returnFocus.current
    window.setTimeout(() => {
      if (el?.isConnected && (document.activeElement === document.body || document.activeElement === null)) el.focus()
    }, 320)
  }

  const onOpen = (table: DiningTable) => {
    const order = table.active_order
    if (!wide && order && can(P.ORDERS_VIEW)) {
      navigate(`/orders/${order.id}`)
      return
    }
    openPanel(table)
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        eyebrow={me.location.name}
        title="Floor"
        subtitle={data ? freeSummary(data.tables) : ' '}
        actions={
          (can(P.TABLES_UPDATE) || can(P.TABLES_CREATE)) && (
            <IconButton icon={SlidersHorizontal} label="Manage tables" onClick={() => navigate('/tables')} />
          )
        }
      />
      {floor.isPending ? (
        <FloorSkeleton />
      ) : !data ? (
        <ErrorState error={floor.error ?? new Error('Couldn’t load the floor.')} onRetry={() => void floor.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <StaleBanner error={floor.isError ? floor.error : null} />
          <StatusSummary tables={data.tables} selected={status} onSelect={(s) => setFilter({ status: status === s ? null : s })} />
          {options.length > 2 && (
            <ChipRow
              options={options}
              value={area}
              onChange={(a) => setFilter({ area: a })}
              label={(a) => (a.kind === 'all' ? 'All areas' : a.name)}
              keyOf={areaKey}
              ariaLabel="Area"
              className="lg:flex-wrap"
            />
          )}
          <FloorGrid
            tables={data.tables}
            groups={groupTables(filterTables(data.tables, area, status), data.areas, area)}
            now={now}
            currency={currency}
            canSeat={canSeat}
            selectedId={panelFor}
            onOpen={onOpen}
            onActions={openPanel}
          />
        </div>
      )}
      <TablePanel table={panelTable} now={now} currency={currency} onClose={closePanel} />
    </div>
  )
}

function FloorGrid({ tables, groups, now, currency, canSeat, selectedId, onOpen, onActions }: {
  tables: DiningTable[]
  groups: ReturnType<typeof groupTables>
  now: number
  currency: string
  canSeat: boolean
  selectedId: number | null
  onOpen: (t: DiningTable) => void
  onActions: (t: DiningTable) => void
}) {
  const visibleCount = groups.reduce((n, g) => n + g.tables.length, 0)
  if (visibleCount === 0) {
    return tables.length === 0 ? (
      <EmptyState icon={LayoutGrid} title="No tables yet" message="Add your tables and areas to start seating guests." />
    ) : (
      <EmptyState icon={LayoutGrid} title="No tables match" message="Nothing here right now. Clear the filter to see every table." />
    )
  }
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.title ?? 'Tables'} className="flex flex-col gap-3">
          {g.title && groups.length > 1 && (
            <h2 className="t-status flex items-center gap-2 pt-1 text-fg3">
              {g.title}
              <span className="t-meta font-medium tracking-normal normal-case">· {g.tables.length}</span>
            </h2>
          )}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
            {g.tables.map((t) => (
              <li key={t.id} className="flex">
                <TableCard
                  table={t}
                  now={now}
                  currency={currency}
                  canSeat={canSeat && isSeatable(t.status)}
                  selected={selectedId === t.id}
                  onOpen={() => onOpen(t)}
                  onActions={() => onActions(t)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Counts per status; clicking one filters the floor to it (and clicking again clears). */
function StatusSummary({ tables, selected, onSelect }: { tables: DiningTable[]; selected: TableStatus | null; onSelect: (s: TableStatus) => void }) {
  const counts = statusCounts(tables)
  return (
    <div role="group" aria-label="Filter by status" className="grid grid-cols-5 gap-2">
      {SUMMARY_STATUSES.map((s) => {
        const v = tableVisual(s)
        const t = TONE[v.tone]
        const on = selected === s
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            aria-label={`${v.label}: ${counts[s]}`}
            onClick={() => onSelect(s)}
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-2 py-2 transition-[background-color,color,transform] duration-150 active:scale-[0.97]',
              'lg:flex-row lg:justify-start lg:gap-3 lg:px-4',
              on ? t.solid : cn(t.bg, t.fg, 'hover:brightness-[0.97]'),
            )}
          >
            <v.icon aria-hidden className="size-4 shrink-0 lg:size-5" />
            <span className="t-amount-lg">{counts[s]}</span>
            <span className="t-status truncate lg:ml-auto">{v.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function FloorSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
      <Skeleton className="h-10 w-80" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
        {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-[136px] rounded-[var(--radius-lg)]" />)}
      </div>
    </div>
  )
}
