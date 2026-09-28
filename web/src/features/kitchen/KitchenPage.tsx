import { History, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useCallback, useMemo, useState } from 'react'
import { useKitchen } from '@/api/queries'
import type { Ticket } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { Button } from '@/ui/Button'
import { CountBadge } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { Segmented } from '@/ui/Controls'
import { PageHeader } from '@/ui/Page'
import { EmptyState, ErrorState, Skeleton, StaleBanner } from '@/ui/States'
import { useTicketTransitions } from './api'
import { useSyncServerClock } from './clock'
import { boardSummary, inLane, laneCounts, laneOf, LANES, WORKING_LANES, type Lane, type TransitionTarget } from './lanes'
import { TicketCard } from './TicketCard'

type WorkingLane = (typeof WORKING_LANES)[number]

/**
 * The kitchen display: New / Preparing / Ready side by side (one lane at a time below 900 px),
 * polled every 4 s, timers on server time. Full-bleed and large type — it's read from the pass.
 */
export default function KitchenPage() {
  const { me, can } = useMe()
  const board = useKitchen()
  useSyncServerClock(board.data?.server_time)
  const tickets = useMemo(() => board.data?.tickets ?? [], [board.data])
  const [showDone, setShowDone] = useState(false)
  const [lane, setLane] = useState<WorkingLane>('new')
  const [focusId, setFocusId] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const onMoved = useCallback((ticket: Ticket, to: TransitionTarget) => {
    if (to !== 'COMPLETED') {
      setAnnouncement(`${ticket.table_name} · ticket ${ticket.ticket_number} moved to ${LANES[laneOf(ticket)].label}`)
    }
    setFocusId(ticket.id)
  }, [])
  const { busy, run } = useTicketTransitions(onMoved)
  const clearFocus = useCallback(() => setFocusId(null), [])

  const counts = useMemo(() => laneCounts(tickets), [tickets])
  const canUpdate = can(P.KITCHEN_UPDATE)
  const zone = me.location.timezone

  const cardProps = { zone, canUpdate, onAction: run, onFocused: clearFocus }

  return (
    <div className="@container flex flex-col md:h-[calc(100dvh-7rem)]">
      <PageHeader
        eyebrow={me.location.name}
        title={showDone ? 'Recently served' : 'Kitchen'}
        subtitle={board.data ? boardSummary(tickets) : undefined}
        className="pb-4"
        actions={
          <Button
            variant="secondary"
            icon={showDone ? X : History}
            onClick={() => setShowDone((v) => !v)}
          >
            {showDone ? 'Back to the board' : 'Show recently served'}
          </Button>
        }
      />
      <div aria-live="polite" className="sr-only">{announcement}</div>
      <StaleBanner error={board.isError && board.data ? board.error : null} className="mb-3" />

      {board.isPending ? (
        <BoardSkeleton />
      ) : board.isError && !board.data ? (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      ) : showDone ? (
        <DoneList tickets={inLane(tickets, 'done')} {...cardProps} />
      ) : (
        <>
          <div className="mb-3 @min-[900px]:hidden">
            <Segmented
              ariaLabel="Kitchen lanes"
              options={WORKING_LANES}
              value={lane}
              onChange={setLane}
              label={(l) => LANES[l].label}
              badge={(l) => counts[l]}
            />
          </div>
          <LayoutGroup>
            <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
              {WORKING_LANES.map((l) => (
                <LaneColumn
                  key={l}
                  lane={l}
                  tickets={inLane(tickets, l)}
                  className={l === lane ? 'flex' : 'hidden @min-[900px]:flex'}
                  busy={busy}
                  focusId={focusId}
                  {...cardProps}
                />
              ))}
            </div>
          </LayoutGroup>
        </>
      )}
    </div>
  )
}

interface CardProps {
  zone: string
  canUpdate: boolean
  onAction: (ticket: Ticket, to: TransitionTarget) => void
  onFocused: () => void
}

function LaneColumn({ lane, tickets, className, busy, focusId, ...card }: CardProps & {
  lane: Lane
  tickets: Ticket[]
  className: string
  busy: ReadonlyMap<number, TransitionTarget>
  focusId: number | null
}) {
  const info = LANES[lane]
  const headingId = `lane-${lane}`
  return (
    <section
      aria-labelledby={headingId}
      className={cn('min-h-[240px] min-w-[300px] flex-1 basis-0 flex-col rounded-[var(--radius-lg)] border border-transparent bg-sunken [[data-appearance=black]_&]:border-line', className)}
    >
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-3">
        <info.icon aria-hidden className="size-5 text-fg2" />
        <h2 id={headingId} className="t-section flex-1 text-fg">{info.label}</h2>
        <CountBadge count={tickets.length} tone={tickets.length > 0 ? 'accent' : 'neutral'} />
        <span className="sr-only">{tickets.length === 1 ? 'ticket' : 'tickets'}</span>
      </div>
      <motion.div layoutScroll className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-8">
        <AnimatePresence initial={false}>
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} busyTo={busy.get(t.id)} focusOnMount={focusId === t.id} {...card} />
          ))}
        </AnimatePresence>
        {tickets.length === 0 && <EmptyState icon={info.icon} title={info.emptyTitle} message={info.emptyMessage} className="py-10" />}
      </motion.div>
    </section>
  )
}

function DoneList({ tickets, ...card }: CardProps & { tickets: Ticket[] }) {
  const info = LANES.done
  if (tickets.length === 0) {
    return (
      <section aria-label="Recently served" className="rounded-[var(--radius-lg)] border border-transparent bg-sunken [[data-appearance=black]_&]:border-line">
        <EmptyState icon={info.icon} title={info.emptyTitle} message={info.emptyMessage} />
      </section>
    )
  }
  return (
    <section aria-label="Recently served" className="min-h-0 flex-1 overflow-y-auto pb-8">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-3">
        {tickets.map((t) => (
          <TicketCard key={t.id} ticket={t} busyTo={undefined} {...card} />
        ))}
      </div>
    </section>
  )
}

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Loading tickets" className="flex min-h-0 flex-1 gap-3">
      {WORKING_LANES.map((l, i) => (
        <div key={l} className={cn('min-w-[300px] flex-1 basis-0 flex-col gap-3 rounded-[var(--radius-lg)] bg-sunken p-3', i === 0 ? 'flex' : 'hidden @min-[900px]:flex')}>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ))}
    </div>
  )
}
