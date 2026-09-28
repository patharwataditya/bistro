import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { keys, useOrder } from './queries'
import type { Order } from './types'

const requestMock = vi.fn()
vi.mock('./client', () => ({ request: (...args: unknown[]) => requestMock(...args) }))

const order = (version: number, status = 'OPEN') => ({ id: 7, version, status }) as unknown as Order

function setup(cached?: Order) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (cached) qc.setQueryData(keys.order(7), cached)
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { qc, wrapper }
}

describe('useOrder', () => {
  beforeEach(() => requestMock.mockReset())

  it('ignores a poll answer older than what a save already cached', async () => {
    const { qc, wrapper } = setup()
    requestMock.mockImplementation(async () => {
      qc.setQueryData(keys.order(7), order(5)) // a save lands while the poll is in flight
      return order(4)
    })
    const { result } = renderHook(() => useOrder(7), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.version).toBe(5)
  })

  it('takes an equal-version answer (kitchen progress does not bump the version)', async () => {
    const { wrapper } = setup(order(5, 'OPEN'))
    requestMock.mockResolvedValue(order(5, 'BILLED'))
    const { result } = renderHook(() => useOrder(7), { wrapper })
    await waitFor(() => expect(result.current.data?.status).toBe('BILLED'))
  })
})
