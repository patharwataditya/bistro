import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import type { Dashboard, Me } from '@/api/types'
import DashboardPage from './DashboardPage'

const mocks = vi.hoisted(() => ({ request: vi.fn(), reloadProfile: vi.fn(), perms: [] as string[] }))

vi.mock('@/api/client', () => ({ request: mocks.request }))
vi.mock('@/auth/session', () => {
  const me: Me = {
    id: 1, username: 'owner', full_name: 'Olivia Owner', roles: [], permissions: [], restaurant_name: 'Bistro',
    location: { id: 1, name: 'Main', timezone: 'UTC', currency_code: 'INR' },
  }
  const can = (p: string) => mocks.perms.includes(p)
  return {
    useMe: () => ({ me, can, grants: { can, any: (...ps: string[]) => ps.some(can) } }),
    useSession: () => ({ reloadProfile: mocks.reloadProfile }),
  }
})

function dashboard(over: Partial<Dashboard> = {}): Dashboard {
  return {
    server_time: new Date().toISOString(), business_date: '2026-09-28', currency_code: 'INR',
    tables: null, kitchen: null, open_orders: null, ready_items: null, open_bills: null, open_bills_amount: null,
    sales_today: null, recent_activity: null,
    ...over,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

beforeEach(() => {
  mocks.request.mockReset()
  mocks.reloadProfile.mockReset()
  mocks.perms = []
})

describe('DashboardPage', () => {
  it('renders only the sections the server included', async () => {
    mocks.request.mockResolvedValue(dashboard({
      open_orders: 3, ready_items: 0,
      sales_today: { net_sales: '1200.00', paid_bills: 2, average_bill: '600.00' } as Dashboard['sales_today'],
    }))
    renderPage()
    expect(await screen.findByText("Today's net sales")).toBeInTheDocument()
    expect(screen.getByText('Orders')).toBeInTheDocument()
    expect(screen.queryByText('Floor')).toBeNull()
    expect(screen.queryByText('Kitchen')).toBeNull()
    expect(screen.queryByText('Bills awaiting payment')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Recent activity' })).toBeNull()
    expect(mocks.request).toHaveBeenCalledWith('/dashboard', expect.anything())
  })

  it('says there is no activity yet when the log is empty', async () => {
    mocks.request.mockResolvedValue(dashboard({ recent_activity: [] }))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    expect(screen.getByText('No activity yet.')).toBeInTheDocument()
  })

  it('explains an empty role instead of showing a blank page', async () => {
    mocks.request.mockResolvedValue(dashboard())
    renderPage()
    expect(await screen.findByText('Nothing to show here')).toBeInTheDocument()
  })

  it('on 403, re-reads the profile and shows why instead of a "Retrying…" banner', async () => {
    mocks.request.mockRejectedValue(new ApiError('forbidden', "You don't have permission to do that.", { status: 403 }))
    renderPage()
    expect(await screen.findByText('Not available to you')).toBeInTheDocument()
    expect(mocks.reloadProfile).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Retrying/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('replaces figures already shown when access is withdrawn', async () => {
    mocks.request.mockResolvedValueOnce(dashboard({ open_orders: 2 }))
    const client = renderPage()
    expect(await screen.findByText('Orders')).toBeInTheDocument()
    mocks.request.mockRejectedValue(new ApiError('forbidden', "You don't have permission to do that.", { status: 403 }))
    await client.refetchQueries()
    expect(await screen.findByText('Not available to you')).toBeInTheDocument()
    expect(screen.queryByText('Orders')).toBeNull()
    expect(screen.queryByText(/Retrying/)).toBeNull()
    expect(mocks.reloadProfile).toHaveBeenCalled()
  })
})
