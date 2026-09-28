import { StickyNote } from 'lucide-react'
import { motion } from 'motion/react'
import { memo, useId } from 'react'
import type { Ticket } from '@/api/types'
import { clock, time } from '@/lib/format'
import { Button } from '@/ui/Button'
import { StatusChip } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { orderVisual, ticketVisual } from '@/ui/status'
import { TONE } from '@/ui/tone'
import { useKitchenNow } from './clock'
import {
  canAct, laneOf, primaryAction, secondaryAction, ticketUrgency, timerCaption, timerDescription, timerStart,
  type TransitionTarget,
} from './lanes'

interface TicketCardProps {
  ticket: Ticket
  zone: string
  canUpdate: boolean
  /** The transition in flight for this ticket, if any. */
  busyTo: TransitionTarget | undefined
  onAction: (ticket: Ticket, to: TransitionTarget) => void
}

/**
 * A kitchen ticket, built to be read at arm's length: table, timer, items and one big button
 * for the next step (Android TicketCard). Only the timer and urgency bar read the ticking
 * clock, so the per-second tick redraws those two small pieces rather than the card.
 */
export const TicketCard = memo(function TicketCard({ ticket, zone, canUpdate, busyTo, onAction }: TicketCardProps) {
  const titleId = useId()
  const done = laneOf(ticket) === 'done'
  const primary = primaryAction(ticket)
  const secondary = secondaryAction(ticket)
  const showActions = canUpdate && canAct(ticket) && primary !== null
  return (
    <motion.article
      data-ticket-id={ticket.id}
      layout="position"
      layoutId={`ticket-${ticket.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14 } }}
      transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-busy={busyTo ? true : undefined}
      className="@container/card shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-card outline-none focus-visible:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--accent)]"
    >
      {done ? <div aria-hidden className={cn('h-1.5', TONE[ticketVisual(ticket.status).tone].stripe)} /> : <UrgencyBar ticket={ticket} />}
      <div className="p-4">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="t-table-label truncate text-fg lg:@min-[320px]/card:text-[28px] lg:@min-[320px]/card:leading-8">{ticket.table_name}</h3>
            <p className="t-identifier truncate text-fg2">Check #{ticket.order_number}</p>
            <p className="t-meta truncate text-fg3">Ticket {ticket.ticket_number} · {ticket.server_name}</p>
            <OrderFlag ticket={ticket} />
          </div>
          {done ? <DoneStamp ticket={ticket} zone={zone} /> : <TicketTimer ticket={ticket} />}
        </header>

        <div role="separator" className="mt-3 mb-1 h-px bg-line" />

        <ul className="flex flex-col" aria-label="Items">
          {ticket.items.map((item) => {
            const voided = item.status === 'VOIDED'
            return (
              <li key={item.id} className="flex items-start gap-2 py-1.5">
                {voided && <span className="sr-only">Voided: </span>}
                <span
                  className={cn('t-section w-10 shrink-0 tabular-nums lg:@min-[320px]/card:text-[22px] lg:@min-[320px]/card:leading-7', voided ? 'text-fg3 line-through' : 'text-accent')}
                >
                  {item.quantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn('t-section break-words lg:@min-[320px]/card:text-[22px] lg:@min-[320px]/card:leading-7', voided ? 'text-fg3 line-through' : 'text-fg')}>{item.name}</span>
                    {voided && (
                      <span className="t-status rounded-[var(--radius-xs)] bg-danger-soft px-1.5 py-0.5 text-danger" aria-hidden>VOID</span>
                    )}
                  </div>
                  {item.notes?.trim() && (
                    <p className={cn('t-body-strong italic', voided ? 'text-fg3 line-through' : 'text-accent')}>{item.notes}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {ticket.order_notes?.trim() && (
          <div className="mt-2 flex items-start gap-2 rounded-[var(--radius-sm)] bg-accent-soft p-3">
            <StickyNote aria-hidden className="mt-0.5 size-[18px] shrink-0 text-accent" />
            <p className="t-body-strong min-w-0 break-words text-fg italic">
              <span className="sr-only">Order note: </span>
              {ticket.order_notes}
            </p>
          </div>
        )}

        {showActions && primary && (
          <div className="mt-4 flex flex-wrap gap-3">
            {secondary && (
              <Button
                variant="secondary"
                size="lg"
                icon={secondary.icon}
                className="h-14 min-w-fit shrink-0 px-4!"
                disabled={busyTo !== undefined && busyTo !== secondary.to}
                loading={busyTo === secondary.to}
                onClick={() => onAction(ticket, secondary.to)}
                aria-label={`${secondary.label} — ${ticket.table_name}, ticket ${ticket.ticket_number}`}
              >
                {secondary.label}
              </Button>
            )}
            <Button
              variant="primary"
              size="lg"
              data-primary=""
              icon={primary.icon}
              className="h-14 min-w-fit flex-1 px-4!"
              disabled={busyTo !== undefined && busyTo !== primary.to}
              loading={busyTo === primary.to}
              onClick={() => onAction(ticket, primary.to)}
              aria-label={`${primary.label} — ${ticket.table_name}, ticket ${ticket.ticket_number}`}
            >
              {primary.label}
            </Button>
          </div>
        )}
      </div>
    </motion.article>
  )
})

function UrgencyBar({ ticket }: { ticket: Ticket }) {
  const now = useKitchenNow()
  const tone = ticketUrgency(ticket, now).tone
  return <div aria-hidden className={cn('h-1.5 transition-colors duration-[240ms]', TONE[tone].stripe)} />
}

function TicketTimer({ ticket }: { ticket: Ticket }) {
  const now = useKitchenNow()
  const urgency = ticketUrgency(ticket, now)
  const calm = urgency.tone === 'neutral'
  const toneText = TONE[urgency.tone].fg
  return (
    <div className="shrink-0 text-right">
      <span className="sr-only">{timerDescription(ticket, now)}</span>
      <div aria-hidden className={cn('t-metric whitespace-nowrap transition-colors duration-[240ms] lg:@min-[320px]/card:text-[36px] lg:@min-[320px]/card:leading-10', calm ? 'text-fg' : toneText)}>
        {clock(timerStart(ticket), now)}
      </div>
      <div aria-hidden className={cn('t-status mt-0.5 whitespace-nowrap', calm ? 'text-fg3' : toneText)}>
        {timerCaption(ticket, now)}
      </div>
    </div>
  )
}

function DoneStamp({ ticket, zone }: { ticket: Ticket; zone: string }) {
  const v = ticketVisual(ticket.status)
  return (
    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
      <StatusChip label={v.label} tone={v.tone} icon={v.icon} />
      {ticket.completed_at && (
        <>
          <span className="t-amount text-fg">{time(ticket.completed_at, zone)}</span>
          <span className="t-meta text-fg3">Took {clock(ticket.fired_at, new Date(ticket.completed_at).getTime())}</span>
        </>
      )}
    </div>
  )
}

/** Tells the kitchen the guests have settled ("Paid") or left ("Cancelled"). */
function OrderFlag({ ticket }: { ticket: Ticket }) {
  if (ticket.order_status === 'CLOSED' || ticket.order_status === 'CANCELLED') {
    const v = orderVisual(ticket.order_status)
    return <StatusChip className="mt-1.5" label={ticket.order_status === 'CLOSED' ? 'Paid' : v.label} tone={v.tone} icon={v.icon} />
  }
  if (ticket.status === 'ACCEPTED') {
    const v = ticketVisual(ticket.status)
    return <StatusChip className="mt-1.5" label={v.label} tone={v.tone} icon={v.icon} />
  }
  return null
}
