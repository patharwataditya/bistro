import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditEntry, AuditPage as AuditPageData, Me } from '@/api/types'
import { mergeAuditEntries } from './api'
import AuditPage from './AuditPage'

const mocks = vi.hoisted(() => ({ request: vi.fn(), perms: ['audit_logs.view'] as string[] }))

vi.mock('@/api/client', () => ({ request: mocks.request }))
vi.mock('@/auth/session', () => {
  const me: Me = {
    id: 1, username: 'owner', full_name: 'Olivia Owner', roles: [], permissions: [], restaurant_name: 'Bistro',
    location: { id: 1, name: 'Main', timezone: 'Asia/Kolkata', currency_code: 'INR' },
  }
  const can = (p: string) => mocks.perms.includes(p)
  return { useMe: () => ({ me, can, grants: { can, any: (...ps: string[]) => ps.some(can) } }) }
})

function entry(id: number, over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id, action: 'bill.paid', entity_type: 'bill', entity_id: String(id), summary: `Entry ${id}`,
    actor_id: 2, actor_name: 'Casey Cashier', metadata: {}, created_at: '2026-09-28T10:00:00Z', ...over,
  }
}
const page = (ids: number[], next: number | null): AuditPageData => ({ items: ids.map((id) => entry(id)), next_before_id: next })

type Query = Record<string, unknown>
function renderAt(url: string, route: (path: string, query: Query) => unknown) {
  mocks.request.mockImplementation((path: string, opts: { query: Query }) => Promise.resolve(route(path, opts.query)))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}><AuditPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}
const auditCalls = () => mocks.request.mock.calls.filter(([path]) => path === '/audit-logs').map(([, opts]) => (opts as { query: Query }).query)

beforeEach(() => {
  mocks.request.mockReset()
  mocks.perms = ['audit_logs.view']
})

describe('AuditPage', () => {
  it('maps the URL filters onto the API query, with dates as restaurant-time bounds', async () => {
    renderAt('/audit?type=billing&actor=7&from=2026-09-03&to=2026-09-05', () => page([], null))
    expect(await screen.findByText('No billing activity')).toBeInTheDocument()
    expect(auditCalls()).toEqual([{
      action: 'bill.', actor_id: 7, entity_type: undefined, since: '2026-09-02T18:30:00.000Z', until: '2026-09-05T18:30:00.000Z',
      before_id: null, limit: 50,
    }])
    // The query's abort signal reaches the request.
    expect(mocks.request.mock.calls[0]?.[1]).toHaveProperty('signal')
  })

  it('shows who a linked person filter is, even when they are not in the staff list', async () => {
    mocks.perms = ['audit_logs.view', 'staff.view']
    renderAt('/audit?actor=7', (path) => (path === '/users'
      ? { items: [{ id: 3, full_name: 'Sam Server', is_active: true }], total: 1 }
      : { items: [entry(5, { actor_id: 7, actor_name: 'Pat Former' })], next_before_id: null }))
    expect(await screen.findByText('Entry 5')).toBeInTheDocument()
    const select = screen.getByLabelText('Person')
    expect(within(select).getByRole('option', { selected: true })).toHaveTextContent('Pat Former')
  })

  it('falls back to "Person #id" when nothing names them', async () => {
    mocks.perms = ['audit_logs.view', 'staff.view']
    renderAt('/audit?actor=9', (path) => (path === '/users' ? { items: [], total: 0 } : page([], null)))
    await screen.findByText('Nothing matches')
    expect(within(screen.getByLabelText('Person')).getByRole('option', { selected: true })).toHaveTextContent('Person #9')
  })

  it('shows an entry once when it appears on two pages', async () => {
    renderAt('/audit', (_path, q) => (q.before_id === null ? page([3, 2], 2) : page([2, 1], null)))
    await screen.findByText('Entry 3')
    await userEvent.click(screen.getByRole('button', { name: 'Load older' }))
    await screen.findByText('Entry 1')
    expect(screen.getAllByText('Entry 2')).toHaveLength(1)
    expect(auditCalls().map((q) => q.before_id)).toEqual([null, 2])
  })
})

describe('mergeAuditEntries', () => {
  it('deduplicates across pages', () => {
    expect(mergeAuditEntries([page([3, 2], 2), page([2, 1], null)], undefined).entries.map((e) => e.id)).toEqual([3, 2, 1])
  })
  it('adds newly polled entries on top without dropping loaded ones', () => {
    const loaded = [page([5, 4], 4), page([3, 2], null)]
    const merged = mergeAuditEntries(loaded, page([7, 6, 5, 4], 4))
    expect(merged.entries.map((e) => e.id)).toEqual([7, 6, 5, 4, 3, 2])
    expect(merged.newerHidden).toBe(false)
  })
  it('holds back a poll that cannot be joined without a gap, and says so', () => {
    const merged = mergeAuditEntries([page([5, 4], null)], page([9, 8], 8))
    expect(merged.entries.map((e) => e.id)).toEqual([5, 4])
    expect(merged.newerHidden).toBe(true)
  })
})
