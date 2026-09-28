import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { Menu, MenuItem } from '@/api/types'
import { ToastProvider } from '@/ui/Toast'
import { useAvailability } from './useAvailability'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ request }))

const item = (id: number, over: Partial<MenuItem> = {}): MenuItem => ({
  id, category_id: 1, name: `Dish ${id}`, description: null, price: '10.00', is_available: true, sort_order: id, version: 1, ...over,
})

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const menu: Menu = { categories: [], items: [item(1), item(2)] }
  client.setQueryData(keys.menu, menu)
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><ToastProvider>{children}</ToastProvider></QueryClientProvider>
  )
  const hook = renderHook(() => useAvailability(), { wrapper })
  const available = (id: number) => client.getQueryData<Menu>(keys.menu)?.items.find((i) => i.id === id)?.is_available
  return { client, hook, invalidate, available }
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

afterEach(() => request.mockReset())

describe('useAvailability', () => {
  it('applies the toggle at once and keeps the server answer without refetching', async () => {
    const { hook, invalidate, available } = setup()
    const d = deferred<MenuItem>()
    request.mockReturnValueOnce(d.promise)
    act(() => hook.result.current.toggle(item(1), false))
    expect(available(1)).toBe(false)
    expect(hook.result.current.busy.has(1)).toBe(true)
    await act(async () => d.resolve(item(1, { is_available: false, version: 2 })))
    await waitFor(() => expect(hook.result.current.busy.has(1)).toBe(false))
    expect(available(1)).toBe(false)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('rolls back a refused toggle, and refreshes only once no other toggle is pending', async () => {
    const { hook, invalidate, available } = setup()
    const first = deferred<MenuItem>()
    const second = deferred<MenuItem>()
    request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    act(() => hook.result.current.toggle(item(1), false))
    act(() => hook.result.current.toggle(item(2), false))
    expect(available(1)).toBe(false)
    expect(available(2)).toBe(false)

    await act(async () => first.reject(new ApiError('invalid-state', 'Not allowed now')))
    await waitFor(() => expect(available(1)).toBe(true))
    // Item 2 is still in flight: a refetch now would flip it back on screen.
    expect(invalidate).not.toHaveBeenCalled()
    expect(available(2)).toBe(false)

    await act(async () => second.resolve(item(2, { is_available: false, version: 2 })))
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
    expect(available(2)).toBe(false)
  })

  it('ignores a second toggle of the same item while one is in flight', async () => {
    const { hook } = setup()
    request.mockReturnValue(new Promise(() => undefined))
    act(() => hook.result.current.toggle(item(1), false))
    act(() => hook.result.current.toggle(item(1), true))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 10))
    expect(request).toHaveBeenCalledTimes(1)
  })
})
