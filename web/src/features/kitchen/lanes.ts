/**
 * The pass, left to right (Android KitchenLanes.kt). Pure functions only, so the board, the
 * cards and the tests all agree on which lane a ticket is in and what its next step is.
 */
import { CircleCheck, CircleCheckBig, ConciergeBell, Flame, ThumbsUp, Undo2, type LucideIcon } from 'lucide-react'
import type { Ticket, TicketStatus } from '@/api/types'
import { urgencyFor, type Urgency } from '@/ui/status'

export type Lane = 'new' | 'preparing' | 'ready' | 'done'

export const WORKING_LANES = ['new', 'preparing', 'ready'] as const satisfies readonly Lane[]

export interface LaneInfo {
  label: string
  emptyTitle: string
  emptyMessage: string
  icon: LucideIcon
}

export const LANES: Record<Lane, LaneInfo> = {
  new: {
    label: 'New',
    emptyTitle: 'No new tickets — the pass is quiet',
    emptyMessage: 'New orders appear here the moment a server sends them.',
    icon: ConciergeBell,
  },
  preparing: {
    label: 'Preparing',
    emptyTitle: 'Nothing on the stove',
    emptyMessage: 'Start a new ticket and it moves here while it cooks.',
    icon: Flame,
  },
  ready: {
    label: 'Ready',
    emptyTitle: 'Nothing waiting at the pass',
    emptyMessage: "Tickets marked ready wait here until they're served.",
    icon: CircleCheckBig,
  },
  done: {
    label: 'Done',
    emptyTitle: 'Nothing served recently',
    emptyMessage: 'Tickets served in the last 30 minutes are listed here.',
    icon: CircleCheck,
  },
}

export function laneOf(ticket: Pick<Ticket, 'status'>): Lane {
  switch (ticket.status) {
    case 'NEW':
    case 'ACCEPTED':
      return 'new'
    case 'PREPARING':
      return 'preparing'
    case 'READY':
      return 'ready'
    default:
      // COMPLETED, CANCELLED and anything a newer server invents.
      return 'done'
  }
}

const time = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : 0)

/** Working lanes oldest first (first in, first out); the done lane most recent first. */
export function inLane(tickets: readonly Ticket[], lane: Lane): Ticket[] {
  const list = tickets.filter((t) => laneOf(t) === lane)
  if (lane === 'done') {
    return list.sort((a, b) => time(b.completed_at ?? b.fired_at) - time(a.completed_at ?? a.fired_at) || b.id - a.id)
  }
  return list.sort((a, b) => time(a.fired_at) - time(b.fired_at) || a.id - b.id)
}

export function laneCounts(tickets: readonly Ticket[]): Record<Lane, number> {
  const counts: Record<Lane, number> = { new: 0, preparing: 0, ready: 0, done: 0 }
  for (const t of tickets) counts[laneOf(t)] += 1
  return counts
}

/** Top-bar summary, as on Android: "2 new · 1 cooking · 0 ready". */
export function boardSummary(tickets: readonly Ticket[]): string {
  const c = laneCounts(tickets)
  return `${c.new} new · ${c.preparing} cooking · ${c.ready} ready`
}

export type TransitionTarget = Extract<TicketStatus, 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED'>

export interface TicketAction {
  label: string
  to: TransitionTarget
  icon: LucideIcon
}

/** The one big next step for a ticket. */
export function primaryAction(ticket: Pick<Ticket, 'status'>): TicketAction | null {
  switch (ticket.status) {
    case 'NEW':
    case 'ACCEPTED':
      return { label: 'Start', to: 'PREPARING', icon: Flame }
    case 'PREPARING':
      return { label: 'Ready', to: 'READY', icon: CircleCheckBig }
    case 'READY':
      return { label: 'Served', to: 'COMPLETED', icon: CircleCheck }
    default:
      return null
  }
}

/** The quieter alternative: acknowledge without starting, or pull a ticket back from the pass. */
export function secondaryAction(ticket: Pick<Ticket, 'status'>): TicketAction | null {
  switch (ticket.status) {
    case 'NEW':
      return { label: 'Accept', to: 'ACCEPTED', icon: ThumbsUp }
    case 'READY':
      return { label: 'Recall', to: 'PREPARING', icon: Undo2 }
    default:
      return null
  }
}

/** Buttons are offered only while the guests are still there (a cancelled check has nothing to cook). */
export function canAct(ticket: Pick<Ticket, 'status' | 'order_status'>): boolean {
  return ticket.order_status !== 'CANCELLED' && primaryAction(ticket) !== null
}

/**
 * What the timer measures. Waiting and cooking count from when the ticket was fired (the
 * guest's wait); at the pass it counts how long the food has been sitting there.
 */
export function timerStart(ticket: Pick<Ticket, 'status' | 'fired_at' | 'ready_at'>): string {
  return ticket.status === 'READY' ? (ticket.ready_at ?? ticket.fired_at) : ticket.fired_at
}

export function timerLabel(status: string): string {
  switch (status) {
    case 'NEW':
      return 'Waiting'
    case 'ACCEPTED':
      return 'Accepted'
    case 'PREPARING':
      return 'Cooking'
    case 'READY':
      return 'At the pass'
    case 'COMPLETED':
      return 'Took'
    case 'CANCELLED':
      return 'Cancelled'
    default:
      return 'Elapsed'
  }
}

export function minutesOn(ticket: Pick<Ticket, 'status' | 'fired_at' | 'ready_at'>, now: number): number {
  return Math.max(0, Math.floor((now - time(timerStart(ticket))) / 60_000))
}

/** Done tickets are always calm; the rest warm up at 10 minutes and go hot at 20. */
export function ticketUrgency(ticket: Pick<Ticket, 'status' | 'fired_at' | 'ready_at'>, now: number): Urgency {
  if (laneOf(ticket) === 'done') return urgencyFor(0)
  return urgencyFor(minutesOn(ticket, now))
}

/** "COOKING · RUNNING LATE" — words carry the urgency, so colour is never the only signal. */
export function timerCaption(ticket: Pick<Ticket, 'status' | 'fired_at' | 'ready_at'>, now: number): string {
  return `${timerLabel(ticket.status)} · ${ticketUrgency(ticket, now).label}`.toUpperCase()
}

/** What a screen reader hears for the timer: minutes only, so it doesn't chatter every second. */
export function timerDescription(ticket: Pick<Ticket, 'status' | 'fired_at' | 'ready_at'>, now: number): string {
  const m = minutesOn(ticket, now)
  return `${timerLabel(ticket.status)} ${m} ${m === 1 ? 'minute' : 'minutes'}, ${ticketUrgency(ticket, now).label}`
}

/** Replace one ticket in the board with the server's answer (or add it if it's new to us). */
export function replaceTicket(tickets: readonly Ticket[], updated: Ticket): Ticket[] {
  return tickets.some((t) => t.id === updated.id) ? tickets.map((t) => (t.id === updated.id ? updated : t)) : [...tickets, updated]
}
