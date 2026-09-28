import { History, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useTicketTransitions, type MoveContext } from './api'
import { useSyncServerClock } from './clock'
import { boardSummary, inLane, laneCounts, laneOf, LANES, WORKING_LANES, type Lane, type TransitionTarget } from './lanes'
import { TicketCard } from './TicketCard'

type WorkingLane = (typeof WORKING_LANES)[number]

/** Where keyboard focus should land once a transition's answer is on the board. */
interface FocusRequest {
  ticketId: number
  /** The ticket's status once moved; the request waits until the board shows it. */
  status: string
  source: Lane
  target: Lane
  /** Tickets to try in the source lane, nearest first, if the moved card can't take focus here. */
  neighbours: number[]
  expires: number
}

const isShown = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && getComputedStyle(el).display !== 'none'

function focusTicket(section: Element, ticketId: number): boolean {
  const card = section.querySelector<HTMLElement>(`[data-ticket-id="${ticketId}"]`)
  const target = card?.querySelector<HTMLElement>('[data-primary]') ?? card
  if (!target) return false
  target.focus()
  return true
}

/**
 * After a move, keep the cook's hands on the board: the moved card's next step if its lane is
 * on screen, otherwise the next ticket in the lane they were working (or that lane's heading).
 * Only when focus was still in the card they acted on — never pulled away from somewhere else.
 */
function applyFocus(root: HTMLElement, req: FocusRequest): void {
  const target = root.querySelector(`[data-lane="${req.target}"]`)
  if (req.target !== 'done' && isShown(target) && focusTicket(target, req.ticketId)) return
  const source = root.querySelector(`[data-lane="${req.source}"]`)
  if (!source) return
  for (const id of req.neighbours) if (focusTicket(source, id)) return
  source.querySelector<HTMLElement>('h2')?.focus()
}

/**
 * The kitchen display: New / Preparing / Ready side by side (one lane at a time below 860 px
 * of content, so a 1024 px screen with the nav rail still shows all three),
 * polled every 4 s, timers on server time. Full-bleed and large type — it's read from the pass.
 */
export default function KitchenPage() {
  const { me, can } = useMe()
  const board = useKitchen()
  useSyncServerClock(board.data?.server_time, board.dataUpdatedAt)
  const tickets = useMemo(() => board.data?.tickets ?? [], [board.data])
  const [showDone, setShowDone] = useState(false)
  const [lane, setLane] = useState<WorkingLane>('new')
  const focusRequest = useRef<FocusRequest | null>(null)
  const [focusAsked, setFocusAsked] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const boardRef = useRef<HTMLDivElement>(null)

  const onMoved = useCallback((ticket: Ticket, to: TransitionTarget, { from, before, hadFocus }: MoveContext) => {
    if (to !== 'COMPLETED') {
      setAnnouncement(`${ticket.table_name} · ticket ${ticket.ticket_number} moved to ${LANES[laneOf(ticket)].label}`)
    }
    if (!hadFocus) return
    const source = laneOf(from)
    const lane = inLane(before, source).map((t) => t.id)
    const at = lane.indexOf(from.id)
    const neighbours = at < 0 ? lane : [...lane.slice(at + 1), ...lane.slice(0, at).reverse()]
    focusRequest.current = { ticketId: ticket.id, status: ticket.status, source, target: laneOf(ticket), neighbours, expires: Date.now() + 3_000 }
    setFocusAsked((n) => n + 1)
  }, [])
  const { busy, run } = useTicketTransitions(onMoved)

  useEffect(() => {
    const req = focusRequest.current
    const root = boardRef.current
    if (!req || !root) return
    const now = tickets.find((t) => t.id === req.ticketId)
    // Wait for the board to show the move (the answer and the re-render can land apart).
    if (now && now.status !== req.status && Date.now() < req.expires) return
    const active = document.activeElement
    const stillHere = !active || active === document.body || active.closest(`[data-ticket-id="${req.ticketId}"]`) !== null
    if (stillHere && Date.now() < req.expires) applyFocus(root, req)
    focusRequest.current = null
  }, [focusAsked, tickets])

  const counts = useMemo(() => laneCounts(tickets), [tickets])
  const canUpdate = can(P.KITCHEN_UPDATE)
  const zone = me.location.timezone

  const cardProps = { zone, canUpdate, onAction: run }

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
          <div className="mb-3 @min-[860px]:hidden">
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
            <div ref={boardRef} className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
              {WORKING_LANES.map((l) => (
                <LaneColumn
                  key={l}
                  lane={l}
                  tickets={inLane(tickets, l)}
                  className={l === lane ? 'flex' : 'hidden @min-[860px]:flex'}
                  busy={busy}
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
}

function LaneColumn({ lane, tickets, className, busy, ...card }: CardProps & {
  lane: Lane
  tickets: Ticket[]
  className: string
  busy: ReadonlyMap<number, TransitionTarget>
}) {
  const info = LANES[lane]
  const headingId = `lane-${lane}`
  return (
    <section
      aria-labelledby={headingId}
      data-lane={lane}
      className={cn('min-h-[240px] min-w-[272px] flex-1 basis-0 flex-col rounded-[var(--radius-lg)] border border-transparent bg-sunken [[data-appearance=black]_&]:border-line', className)}
    >
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-3">
        <info.icon aria-hidden className="size-5 text-fg2" />
        <h2 id={headingId} tabIndex={-1} className="t-section flex-1 rounded-[var(--radius-xs)] text-fg outline-none focus-visible:shadow-[0_0_0_2px_var(--accent)]">{info.label}</h2>
        <CountBadge count={tickets.length} tone={tickets.length > 0 ? 'accent' : 'neutral'} />
        <span className="sr-only">{tickets.length === 1 ? 'ticket' : 'tickets'}</span>
      </div>
      <motion.div layoutScroll className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-8">
        <AnimatePresence initial={false}>
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} busyTo={busy.get(t.id)} {...card} />
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
        <div key={l} className={cn('min-w-[272px] flex-1 basis-0 flex-col gap-3 rounded-[var(--radius-lg)] bg-sunken p-3', i === 0 ? 'flex' : 'hidden @min-[860px]:flex')}>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ))}
    </div>
  )
}
