import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import type { KitchenBoard, Ticket } from '@/api/types'
import { ToastProvider } from '@/ui/Toast'
import { useTicketTransitions } from './api'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/api/client', () => ({ request: mocks.request }))

function ticket(id: number, status: Ticket['status'], version = 1): Ticket {
  return {
    id, ticket_number: id, status, order_id: id, order_number: id, order_status: 'OPEN', order_notes: null, table_name: `T${id}`,
    server_name: 'Sofia', fired_at: '2026-09-28T10:00:00Z', accepted_at: null, started_at: null, ready_at: null, completed_at: null,
    version, items: [],
  }
}

/** One controllable answer per ticket. */
const answers = new Map<number, { resolve: (t: Ticket) => void; reject: (e: unknown) => void }>()

beforeEach(() => {
  answers.clear()
  mocks.request.mockReset()
  mocks.request.mockImplementation((path: string) => {
    const id = Number(/tickets\/(\d+)\/transition/.exec(path)?.[1])
    return new Promise((resolve, reject) => answers.set(id, { resolve, reject }))
  })
})

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const board: KitchenBoard = { server_time: '2026-09-28T10:10:00Z', tickets: [ticket(1, 'NEW'), ticket(2, 'PREPARING')] } as KitchenBoard
  client.setQueryData(['kitchen'], board)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><ToastProvider>{children}</ToastProvider></QueryClientProvider>
  )
  const onMoved = vi.fn()
  const hook = renderHook(() => useTicketTransitions(onMoved), { wrapper })
  return { client, hook, onMoved }
}

const boardTickets = (client: QueryClient) => client.getQueryData<KitchenBoard>(['kitchen'])?.tickets ?? []

describe('useTicketTransitions', () => {
  it('runs two tickets at once, each with its own busy lock, and applies each answer on its own', async () => {
    const { client, hook, onMoved } = setup()
    const [t1, t2] = boardTickets(client) as [Ticket, Ticket]

    act(() => {
      hook.result.current.run(t1, 'PREPARING')
      hook.result.current.run(t2, 'READY')
    })
    await waitFor(() => expect(hook.result.current.busy).toEqual(new Map([[1, 'PREPARING'], [2, 'READY']])))
    expect(mocks.request).toHaveBeenCalledTimes(2)
    expect(mocks.request).toHaveBeenCalledWith('/kitchen/tickets/1/transition', expect.objectContaining({ body: { version: 1, to: 'PREPARING' } }))

    // A second tap on a ticket that's already on the wire is ignored; the other ticket is free.
    act(() => hook.result.current.run(t1, 'PREPARING'))
    expect(mocks.request).toHaveBeenCalledTimes(2)

    // The second ticket answers first: only it is released and replaced.
    await act(async () => answers.get(2)?.resolve(ticket(2, 'READY', 2)))
    await waitFor(() => expect(hook.result.current.busy).toEqual(new Map([[1, 'PREPARING']])))
    expect(boardTickets(client).map((t) => [t.id, t.status])).toEqual([[1, 'NEW'], [2, 'READY']])
    expect(onMoved).toHaveBeenCalledWith(expect.objectContaining({ id: 2, status: 'READY' }), 'READY',
      expect.objectContaining({ from: t2, hadFocus: false }))

    // The first is refused as stale: released, the board refetched, the cook told why.
    await act(async () => answers.get(1)?.reject(new ApiError('stale', 'Someone else changed this ticket.', { status: 409 })))
    await waitFor(() => expect(hook.result.current.busy.size).toBe(0))
    expect(onMoved).toHaveBeenCalledTimes(1)
    expect((await screen.findAllByText('Someone else changed this ticket.')).length).toBeGreaterThan(0)
    expect(client.getQueryState(['kitchen'])?.isInvalidated).toBe(true)
  })

  it('reports whether focus was still in the acted-on card', async () => {
    const { client, hook, onMoved } = setup()
    const [t1] = boardTickets(client) as [Ticket]
    const card = document.createElement('article')
    card.dataset.ticketId = '1'
    const button = document.createElement('button')
    card.append(button)
    document.body.append(card)
    button.focus()
    act(() => hook.result.current.run(t1, 'PREPARING'))
    await waitFor(() => expect(answers.has(1)).toBe(true))
    await act(async () => answers.get(1)?.resolve(ticket(1, 'PREPARING', 2)))
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith(expect.anything(), 'PREPARING', expect.objectContaining({ hadFocus: true })))
    card.remove()
  })
})
