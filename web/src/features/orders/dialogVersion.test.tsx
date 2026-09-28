import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { Order } from '@/api/types'
import { useOpenVersion } from './dialogVersion'

function order(version: number, guests = 2): Order {
  return {
    id: 5, order_number: 12, status: 'OPEN', table_id: 1, table_name: 'T1', server_id: 1, server_name: 'Sofia', guest_count: guests,
    notes: null, opened_at: '2026-01-01T12:00:00Z', billed_at: null, closed_at: null, cancelled_at: null, cancel_reason: null,
    merged_into_id: null, items: [], bill_id: null, currency_code: 'INR', version,
    totals: { subtotal: '0', discount_amount: '0', service_charge_percent: '0', service_charge_amount: '0', taxes: [], tax_total: '0', round_off: '0', total: '0' },
  }
}

function setup(flush: () => Promise<Order | null> = () => Promise.resolve(null)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(({ o, open }: { o: Order; open: boolean }) => useOpenVersion(o, open, flush), {
    wrapper,
    initialProps: { o: order(3), open: false },
  })
  return { client, hook }
}

describe('useOpenVersion', () => {
  it('keeps the version from when the dialog opened, not the latest poll', async () => {
    const { hook } = setup()
    expect(hook.result.current.version).toBeNull()
    hook.rerender({ o: order(3), open: true })
    await waitFor(() => expect(hook.result.current.version).toBe(3))
    // Another device changed the guests; the poll brings version 4 while the dialog is open.
    hook.rerender({ o: order(4, 9), open: true })
    expect(hook.result.current.version).toBe(3)
    // Next time it opens it starts from what's current.
    hook.rerender({ o: order(4, 9), open: false })
    hook.rerender({ o: order(4, 9), open: true })
    await waitFor(() => expect(hook.result.current.version).toBe(4))
  })

  it('takes the version after saving quantities still being typed', async () => {
    let release!: (o: Order) => void
    const flush = vi.fn(() => new Promise<Order | null>((res) => { release = res }))
    const { hook } = setup(flush)
    hook.rerender({ o: order(3), open: true })
    expect(hook.result.current.version).toBeNull()
    await act(async () => release(order(5)))
    await waitFor(() => expect(hook.result.current.version).toBe(5))
  })

  it('on a 409 explains, refreshes and captures the new version', async () => {
    const { client, hook } = setup()
    hook.rerender({ o: order(3), open: true })
    await waitFor(() => expect(hook.result.current.version).toBe(3))
    const stale = new ApiError('stale', 'changed', { status: 409 })
    expect(hook.result.current.toastError(stale)).toBe(false)
    client.setQueryData(keys.order(5), order(6, 9))
    vi.spyOn(client, 'refetchQueries').mockResolvedValue(undefined)
    act(() => hook.result.current.onError(stale))
    expect(hook.result.current.stale).toBe(true)
    await waitFor(() => expect(hook.result.current.version).toBe(6))
    expect(hook.result.current.toastError(new ApiError('server', 'down'))).toBe(true)
  })
})
