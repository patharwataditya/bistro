import { describe, expect, it } from 'vitest'
import type { Ticket } from '@/api/types'
import {
  boardSummary, canAct, inLane, laneCounts, laneOf, primaryAction, replaceTicket, secondaryAction, ticketUrgency,
  timerCaption, timerDescription, timerStart,
} from './lanes'

const T0 = Date.parse('2026-09-28T12:00:00Z')
const at = (minutes: number, seconds = 0) => new Date(T0 + minutes * 60_000 + seconds * 1000).toISOString()

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 1, ticket_number: 1, status: 'NEW', order_id: 1, order_number: 12, order_status: 'OPEN', order_notes: null,
    table_name: 'T2', server_name: 'Sofia Server', fired_at: at(0), accepted_at: null, started_at: null, ready_at: null,
    completed_at: null, items: [], version: 1, ...over,
  }
}

describe('lane assignment', () => {
  it('puts NEW and ACCEPTED in New, then Preparing, Ready and Done', () => {
    expect(laneOf(ticket({ status: 'NEW' }))).toBe('new')
    expect(laneOf(ticket({ status: 'ACCEPTED' }))).toBe('new')
    expect(laneOf(ticket({ status: 'PREPARING' }))).toBe('preparing')
    expect(laneOf(ticket({ status: 'READY' }))).toBe('ready')
    expect(laneOf(ticket({ status: 'COMPLETED' }))).toBe('done')
    expect(laneOf(ticket({ status: 'CANCELLED' }))).toBe('done')
    expect(laneOf(ticket({ status: 'SOMETHING_NEW' }))).toBe('done')
  })

  it('orders working lanes oldest first and the done lane newest first', () => {
    const tickets = [
      ticket({ id: 1, status: 'NEW', fired_at: at(5) }),
      ticket({ id: 2, status: 'ACCEPTED', fired_at: at(1) }),
      ticket({ id: 3, status: 'NEW', fired_at: at(1) }),
      ticket({ id: 4, status: 'COMPLETED', fired_at: at(0), completed_at: at(10) }),
      ticket({ id: 5, status: 'COMPLETED', fired_at: at(2), completed_at: at(20) }),
    ]
    expect(inLane(tickets, 'new').map((t) => t.id)).toEqual([2, 3, 1])
    expect(inLane(tickets, 'done').map((t) => t.id)).toEqual([5, 4])
    expect(inLane(tickets, 'ready')).toEqual([])
    expect(laneCounts(tickets)).toEqual({ new: 3, preparing: 0, ready: 0, done: 2 })
    expect(boardSummary(tickets)).toBe('3 new · 0 cooking · 0 ready')
  })

  it('replaces a ticket in place with the server answer', () => {
    const board = [ticket({ id: 1 }), ticket({ id: 2 })]
    const moved = ticket({ id: 2, status: 'PREPARING', version: 2 })
    expect(replaceTicket(board, moved)).toEqual([board[0], moved])
    expect(replaceTicket(board, ticket({ id: 9 })).map((t) => t.id)).toEqual([1, 2, 9])
  })
})

describe('actions', () => {
  it('offers Android’s primary and secondary steps', () => {
    expect(primaryAction(ticket({ status: 'NEW' }))?.to).toBe('PREPARING')
    expect(primaryAction(ticket({ status: 'NEW' }))?.label).toBe('Start')
    expect(secondaryAction(ticket({ status: 'NEW' }))).toMatchObject({ label: 'Accept', to: 'ACCEPTED' })
    expect(primaryAction(ticket({ status: 'ACCEPTED' }))).toMatchObject({ label: 'Start', to: 'PREPARING' })
    expect(secondaryAction(ticket({ status: 'ACCEPTED' }))).toBeNull()
    expect(primaryAction(ticket({ status: 'PREPARING' }))).toMatchObject({ label: 'Ready', to: 'READY' })
    expect(primaryAction(ticket({ status: 'READY' }))).toMatchObject({ label: 'Served', to: 'COMPLETED' })
    expect(secondaryAction(ticket({ status: 'READY' }))).toMatchObject({ label: 'Recall', to: 'PREPARING' })
    expect(primaryAction(ticket({ status: 'COMPLETED' }))).toBeNull()
  })

  it('hides buttons once the check is cancelled', () => {
    expect(canAct(ticket({ status: 'PREPARING', order_status: 'CANCELLED' }))).toBe(false)
    expect(canAct(ticket({ status: 'PREPARING', order_status: 'CLOSED' }))).toBe(true)
  })
})

describe('timers and urgency captions', () => {
  it('counts from firing, or from ready_at at the pass', () => {
    expect(timerStart(ticket({ status: 'PREPARING', fired_at: at(0), ready_at: at(4) }))).toBe(at(0))
    expect(timerStart(ticket({ status: 'READY', fired_at: at(0), ready_at: at(4) }))).toBe(at(4))
  })

  it('words the urgency: on time, running late at 10 min, overdue at 20 min', () => {
    const t = ticket({ status: 'NEW', fired_at: at(0) })
    expect(timerCaption(t, T0 + 9 * 60_000 + 59_000)).toBe('WAITING · ON TIME')
    expect(timerCaption(ticket({ status: 'PREPARING' }), T0 + 10 * 60_000)).toBe('COOKING · RUNNING LATE')
    expect(timerCaption(ticket({ status: 'ACCEPTED' }), T0 + 20 * 60_000)).toBe('ACCEPTED · OVERDUE')
    expect(ticketUrgency(ticket({ status: 'PREPARING' }), T0 + 25 * 60_000).tone).toBe('danger')
  })

  it('measures the pass from ready_at, so fresh food at the pass is on time', () => {
    const t = ticket({ status: 'READY', fired_at: at(0), ready_at: at(30) })
    expect(timerCaption(t, T0 + 32 * 60_000)).toBe('AT THE PASS · ON TIME')
    expect(timerCaption(t, T0 + 41 * 60_000)).toBe('AT THE PASS · RUNNING LATE')
  })

  it('keeps served tickets calm and describes timers in whole minutes', () => {
    const done = ticket({ status: 'COMPLETED', fired_at: at(0), completed_at: at(40) })
    expect(ticketUrgency(done, T0 + 60 * 60_000).label).toBe('On time')
    expect(timerDescription(ticket({ status: 'PREPARING' }), T0 + 61_000)).toBe('Cooking 1 minute, On time')
    expect(timerDescription(ticket({ status: 'PREPARING' }), T0 + 12 * 60_000 + 5_000)).toBe('Cooking 12 minutes, Running late')
  })

  it('never shows negative time when the browser clock is behind', () => {
    expect(timerDescription(ticket({ status: 'NEW', fired_at: at(5) }), T0)).toBe('Waiting 0 minutes, On time')
  })
})
