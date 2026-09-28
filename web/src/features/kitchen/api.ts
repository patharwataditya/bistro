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

interface Vars {
  ticket: Ticket
  to: TransitionTarget
}

/**
 * Ticket transitions with a per-ticket busy lock: a kitchen has several cooks bumping
 * different tickets at once, so one ticket's request never freezes the rest of the board.
 * Nothing is optimistic — the ticket is replaced in place with the server's answer.
 */
export function useTicketTransitions(onMoved?: (ticket: Ticket, to: TransitionTarget) => void) {
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
    onSuccess: async (updated, { to }) => {
      // A poll that started before this answer would land with the old ticket: drop it.
      await queryClient.cancelQueries({ queryKey: keys.kitchen })
      queryClient.setQueryData<KitchenBoard>(keys.kitchen, (board) =>
        board ? { ...board, tickets: replaceTicket(board.tickets, updated) } : board,
      )
      if (to === 'COMPLETED') toast.success(`${updated.table_name} · ticket ${updated.ticket_number} served`)
      onMoved?.(updated, to)
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
