import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { Order, OrderItem } from '@/api/types'
import { ToastProvider } from '@/ui/Toast'
import { DEBOUNCE_MS, RETRY_MS, useQuantityDrafts } from './useQuantityDrafts'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ request }))

const ORDER_ID = 5

function line(id: number, quantity: number): OrderItem {
  return {
    id, menu_item_id: id, name: `Dish ${id}`, unit_price: '10.00', quantity, line_total: '10.00', notes: null,
    status: 'PENDING', ticket_id: null, void_reason: null, created_at: '2026-01-01T12:00:00Z',
  }
}

function order(version: number, items: OrderItem[] = [line(1, 1), line(2, 1)]): Order {
  return {
    id: ORDER_ID, order_number: 12, status: 'OPEN', table_id: 1, table_name: 'T1', server_id: 1, server_name: 'Sofia', guest_count: 2,
    notes: null, opened_at: '2026-01-01T12:00:00Z', billed_at: null, closed_at: null, cancelled_at: null, cancel_reason: null,
    merged_into_id: null, items, bill_id: null, currency_code: 'INR', version,
    totals: { subtotal: '0', discount_amount: '0', service_charge_percent: '0', service_charge_amount: '0', taxes: [], tax_total: '0', round_off: '0', total: '0' },
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(keys.order(ORDER_ID), order(1))
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><ToastProvider>{children}</ToastProvider></QueryClientProvider>
  )
  const hook = renderHook(() => useQuantityDrafts(ORDER_ID), { wrapper })
  const cached = () => client.getQueryData<Order>(keys.order(ORDER_ID))
  return { client, hook, cached }
}

const patches = () => request.mock.calls.filter(([, init]) => (init as { method?: string }).method === 'PATCH')
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  request.mockReset()
})

describe('useQuantityDrafts', () => {
  it('shows every click at once and sends only the last value once the clicks stop', async () => {
    const { hook } = setup()
    request.mockResolvedValue(order(2, [line(1, 4), line(2, 1)]))
    act(() => {
      hook.result.current.set(1, 2)
      hook.result.current.set(1, 3)
      hook.result.current.set(1, 4)
    })
    expect(hook.result.current.drafts.get(1)).toBe(4)
    await tick(DEBOUNCE_MS - 1)
    expect(patches()).toHaveLength(0)
    await tick(1)
    expect(patches()).toHaveLength(1)
    expect(patches()[0]?.[1]).toMatchObject({ body: { quantity: 4 } })
    expect(hook.result.current.drafts.size).toBe(0)
  })

  it('flush waits for a save already in flight instead of sending it again', async () => {
    const { hook, cached } = setup()
    const slow = deferred<Order>()
    request.mockReturnValueOnce(slow.promise)
    act(() => hook.result.current.set(1, 3))
    await tick(DEBOUNCE_MS)
    expect(patches()).toHaveLength(1)

    let flushed: Order | null | undefined
    let done = false
    void hook.result.current.flush().then((o) => {
      flushed = o
      done = true
    })
    await tick(0)
    expect(done).toBe(false)
    expect(patches()).toHaveLength(1)

    await act(async () => slow.resolve(order(2, [line(1, 3), line(2, 1)])))
    await tick(0)
    expect(done).toBe(true)
    expect(patches()).toHaveLength(1)
    expect(flushed?.version).toBe(2)
    expect(cached()?.version).toBe(2)
  })

  it('never lets a late answer replace a newer check', async () => {
    const { client, hook, cached } = setup()
    const slow = deferred<Order>()
    request.mockReturnValueOnce(slow.promise)
    act(() => hook.result.current.set(1, 3))
    await tick(DEBOUNCE_MS)
    // Meanwhile the check moved on (e.g. it was sent to the kitchen).
    client.setQueryData(keys.order(ORDER_ID), order(4, [{ ...line(1, 3), status: 'SENT' }, line(2, 1)]))
    await act(async () => slow.resolve(order(2, [line(1, 3), line(2, 1)])))
    await tick(0)
    expect(cached()?.version).toBe(4)
    expect(cached()?.items[0]?.status).toBe('SENT')
  })

  it('keeps a quantity that failed to save, shows it, refuses to flush, and retries', async () => {
    const { hook } = setup()
    request.mockRejectedValueOnce(new ApiError('server', 'down'))
    act(() => hook.result.current.set(1, 3))
    await tick(DEBOUNCE_MS)
    expect(hook.result.current.drafts.get(1)).toBe(3)
    expect(hook.result.current.failed.has(1)).toBe(true)

    request.mockRejectedValueOnce(new ApiError('offline', 'no network'))
    await act(async () => {
      await expect(hook.result.current.flush()).rejects.toMatchObject({ kind: 'offline' })
    })
    expect(hook.result.current.drafts.get(1)).toBe(3)

    request.mockResolvedValueOnce(order(2, [line(1, 3), line(2, 1)]))
    await tick(RETRY_MS)
    expect(patches().at(-1)?.[1]).toMatchObject({ body: { quantity: 3 } })
    expect(hook.result.current.drafts.size).toBe(0)
    expect(hook.result.current.failed.size).toBe(0)
  })

  it('drops a quantity the server refuses and refreshes the check', async () => {
    const { client, hook } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    request.mockRejectedValueOnce(new ApiError('invalid-state', 'Already sent'))
    act(() => hook.result.current.set(1, 3))
    await tick(DEBOUNCE_MS)
    expect(hook.result.current.drafts.size).toBe(0)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.order(ORDER_ID) })
    await tick(RETRY_MS)
    expect(patches()).toHaveLength(1)
  })

  it('cancel forgets a waiting quantity and waits for one in flight', async () => {
    const { hook } = setup()
    act(() => hook.result.current.set(1, 3))
    await act(async () => hook.result.current.cancel(1))
    await tick(DEBOUNCE_MS)
    expect(patches()).toHaveLength(0)
    expect(hook.result.current.drafts.size).toBe(0)

    const slow = deferred<Order>()
    request.mockReturnValueOnce(slow.promise)
    act(() => hook.result.current.set(2, 5))
    await tick(DEBOUNCE_MS)
    let cancelled = false
    void hook.result.current.cancel(2).then(() => {
      cancelled = true
    })
    await tick(0)
    expect(cancelled).toBe(false)
    // The line was removed meanwhile: the late refusal is not reported.
    await act(async () => slow.reject(new ApiError('not-found', 'Item not found on this order.')))
    await tick(0)
    expect(cancelled).toBe(true)
    expect(hook.result.current.failed.size).toBe(0)
  })

  it('saves one item strictly in order: the next value waits for the one in flight', async () => {
    const { hook } = setup()
    const first = deferred<Order>()
    request.mockReturnValueOnce(first.promise).mockResolvedValueOnce(order(3, [line(1, 4), line(2, 1)]))
    act(() => hook.result.current.set(1, 3))
    await tick(DEBOUNCE_MS)
    act(() => hook.result.current.set(1, 4))
    await tick(DEBOUNCE_MS)
    expect(patches()).toHaveLength(1)
    await act(async () => first.resolve(order(2, [line(1, 3), line(2, 1)])))
    await tick(0)
    expect(patches()).toHaveLength(2)
    expect(patches()[1]?.[1]).toMatchObject({ body: { quantity: 4 } })
    expect(hook.result.current.drafts.size).toBe(0)
  })

  it('rebases a typed quantity when an add merged into the same line', async () => {
    const { hook } = setup()
    request.mockResolvedValue(order(3, [line(1, 5), line(2, 1)]))
    act(() => hook.result.current.set(1, 3)) // server has 1, typed 3
    act(() => hook.result.current.rebase(order(1, [line(1, 1), line(2, 1)]), order(2, [line(1, 2), line(2, 1)])))
    expect(hook.result.current.drafts.get(1)).toBe(4)
    await tick(DEBOUNCE_MS)
    expect(patches().at(-1)?.[1]).toMatchObject({ body: { quantity: 4 } })
  })
})
