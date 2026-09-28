import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { request } from '@/api/client'
import { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { components } from '@/api/schema'
import type { KitchenBoard, Ticket } from '@/api/types'
import { useToast } from '@/ui/Toast'
import { replaceTicket, type TransitionTarget } from './lanes'

type TransitionIn = components['schemas']['TicketTransitionIn']

export function transitionTicket(ticket: Pick<Ticket, 'id' | 'version'>, to: TransitionTarget): Promise<Ticket> {
  const body: TransitionIn = { version: ticket.version, to }
  return request<Ticket>(`/kitchen/tickets/${ticket.id}/transition`, { method: 'POST', body })
}

/** What the board knew when a transition's answer arrived, for putting focus somewhere sensible. */
export interface MoveContext {
  /** The ticket as the cook acted on it. */
  from: Ticket
  /** The board just before the answer was applied. */
  before: readonly Ticket[]
  /** Keyboard focus was still inside the acted-on card (the cook hadn't moved on). */
  hadFocus: boolean
}

/** True while focus is on (or inside) the card for this ticket. */
export function focusInTicket(ticketId: number): boolean {
  const active = typeof document === 'undefined' ? null : document.activeElement
  return active?.closest('[data-ticket-id]')?.getAttribute('data-ticket-id') === String(ticketId)
}

interface Vars {
  ticket: Ticket
  to: TransitionTarget
}

/**
 * Ticket transitions with a per-ticket busy lock: a kitchen has several cooks bumping
 * different tickets at once, so one ticket's request never freezes the rest of the board.
 * Nothing is optimistic — the ticket is replaced in place with the server's answer.
 */
export function useTicketTransitions(onMoved?: (ticket: Ticket, to: TransitionTarget, context: MoveContext) => void) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState<ReadonlyMap<number, TransitionTarget>>(new Map())
  const inFlight = useRef(new Set<number>())

  const mutation = useMutation<Ticket, ApiError, Vars>({
    mutationFn: ({ ticket, to }) => transitionTicket(ticket, to),
    onMutate: ({ ticket, to }) => {
      inFlight.current.add(ticket.id)
      setBusy((m) => new Map(m).set(ticket.id, to))
    },
    onSuccess: async (updated, { ticket, to }) => {
      // Read before anything re-renders: once the card moves, the button that had focus is gone.
      const hadFocus = focusInTicket(ticket.id)
      // A poll that started before this answer would land with the old ticket: drop it.
      await queryClient.cancelQueries({ queryKey: keys.kitchen })
      const before = queryClient.getQueryData<KitchenBoard>(keys.kitchen)?.tickets ?? []
      queryClient.setQueryData<KitchenBoard>(keys.kitchen, (board) =>
        board ? { ...board, tickets: replaceTicket(board.tickets, updated) } : board,
      )
      if (to === 'COMPLETED') toast.success(`${updated.table_name} · ticket ${updated.ticket_number} served`)
      onMoved?.(updated, to, { from: ticket, before, hadFocus: hadFocus && (focusInTicket(ticket.id) || document.activeElement === document.body) })
      void queryClient.invalidateQueries({ queryKey: keys.dashboard })
    },
    onError: (error) => {
      const err = error instanceof ApiError ? error : new ApiError('unexpected', 'Something unexpected happened. Try again.')
      if (err.kind !== 'session-ended') toast.error(err.message)
      if (err.kind === 'stale' || err.kind === 'invalid-state' || err.kind === 'not-found') {
        void queryClient.invalidateQueries({ queryKey: keys.kitchen })
      }
    },
    onSettled: (_data, _error, { ticket }) => {
      inFlight.current.delete(ticket.id)
      setBusy((m) => {
        const next = new Map(m)
        next.delete(ticket.id)
        return next
      })
    },
  })

  const { mutate } = mutation
  const run = useCallback(
    (ticket: Ticket, to: TransitionTarget) => {
      if (inFlight.current.has(ticket.id)) return
      mutate({ ticket, to })
    },
    [mutate],
  )

  return { busy, run }
}
