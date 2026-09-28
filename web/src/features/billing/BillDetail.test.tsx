import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import type { Bill, Me, PaymentMethod } from '@/api/types'
import { ToastProvider } from '@/ui/Toast'
import { BillDetail } from './BillDetail'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@/api/client', () => ({ request: mocks.request }))
vi.mock('@/auth/session', () => {
  const me: Me = {
    id: 1, username: 'cashier', full_name: 'Casey Cashier', roles: [], permissions: [], restaurant_name: 'Bistro',
    location: { id: 1, name: 'Main', timezone: 'UTC', currency_code: 'INR' },
  }
  const can = () => true
  return { useMe: () => ({ me, can, grants: { can, any: () => true } }) }
})

const METHODS: PaymentMethod[] = [
  { id: 1, name: 'Cash', is_cash: true, is_active: true, sort_order: 0 },
  { id: 2, name: 'Card', is_cash: false, is_active: true, sort_order: 1 },
]

function makeBill(over: Partial<Bill> = {}): Bill {
  return {
    id: 7, bill_number: 'B-0007', status: 'OPEN', order_id: 3, order_number: 12, table_name: 'T4', server_name: 'Sofia Server',
    guest_count: 2, currency_code: 'INR', subtotal: '1000.00', discount_type: null, discount_value: null, discount_amount: '0.00',
    discount_reason: null, service_charge_percent: '0.00', service_charge_amount: '0.00', taxes: [], tax_total: '0.00',
    round_off: '0.00', total: '1000.00', paid_total: '0.00', refunded_total: '0.00', balance_due: '1000.00', payments: [],
    created_by_name: 'Casey Cashier', created_at: '2026-09-28T10:00:00Z', paid_at: null, voided_at: null, void_reason: null,
    version: 3,
    ...over,
  }
}

function cashPayment(amount: string, tendered: string | null, change: string): Bill['payments'][number] {
  return {
    id: 50, kind: 'PAYMENT', payment_method_id: 1, method_name: 'Cash', amount, tendered, change_due: change, reference: null,
    reason: null, is_correction: false, created_by_name: 'Someone Else', created_at: '2026-09-28T10:05:00Z',
  }
}

/** What the fake server says the bill is right now (what a poll returns). */
let server: Bill
type Post = (body: Record<string, unknown>, key: string | undefined) => Promise<Bill>
let onPay: Post
let onRefund: Post
const posts: { path: string; body: Record<string, unknown>; key: string | undefined }[] = []

beforeEach(() => {
  server = makeBill()
  posts.length = 0
  onPay = () => Promise.reject(new Error('unexpected pay'))
  onRefund = () => Promise.reject(new Error('unexpected refund'))
  mocks.request.mockReset()
  mocks.request.mockImplementation((path: string, opts: { method?: string; body?: Record<string, unknown>; idempotencyKey?: string } = {}) => {
    if (path === '/payment-methods') return Promise.resolve(METHODS)
    if (path === '/bills/7' && !opts.method) return Promise.resolve(server)
    if (opts.method === 'POST') {
      posts.push({ path, body: opts.body ?? {}, key: opts.idempotencyKey })
      if (path === '/bills/7/payments') return onPay(opts.body ?? {}, opts.idempotencyKey)
      if (path === '/bills/7/refunds') return onRefund(opts.body ?? {}, opts.idempotencyKey)
    }
    return Promise.resolve(undefined)
  })
})

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/bills/7']}><BillDetail billId={7} /></MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  const poll = () => client.refetchQueries({ queryKey: ['bill', 7] })
  return { client, poll }
}

const user = () => userEvent.setup()

async function openPayment(u: ReturnType<typeof userEvent.setup>, amount: string) {
  await u.click(await screen.findByRole('button', { name: /Take payment/ }))
  const drawer = await screen.findByRole('dialog', { name: 'Take payment' })
  const field = within(drawer).getByRole('textbox', { name: 'Amount' })
  await u.clear(field)
  await u.type(field, amount)
  return drawer
}

/** Toasts render twice (visible, and in a live region). */
const toasted = async (text: string | RegExp) => expect((await screen.findAllByText(text)).length).toBeGreaterThan(0)
const pays = () => posts.filter((p) => p.path === '/bills/7/payments')
const gone = (name: string) => waitFor(() => expect(screen.queryByRole('dialog', { name })).toBeNull())

describe('BillDetail money intents', () => {
  it('pins a charge to the version it was decided on, replays a lost one with the same key, and gives a new charge a new key', async () => {
    const u = user()
    setup()
    let drawer = await openPayment(u, '400')
    onPay = () => Promise.reject(new ApiError('offline', "You're offline."))
    await u.click(within(drawer).getByRole('button', { name: /^Charge/ }))
    await waitFor(() => expect(pays()).toHaveLength(1))
    // Lost answer: the same charge again is the same intent.
    const settledBill = makeBill({ version: 4, paid_total: '400.00', balance_due: '600.00' })
    onPay = () => {
      server = settledBill
      return Promise.resolve(settledBill)
    }
    await u.click(within(drawer).getByRole('button', { name: /^Charge/ }))
    await waitFor(() => expect(pays()).toHaveLength(2))
    expect(pays()[1]?.key).toBe(pays()[0]?.key)
    expect(pays().map((p) => p.body.version)).toEqual([3, 3])
    await gone('Take payment')
    await toasted(/400\.00 received · .*600\.00 still due/)

    // A new charge of the same amount, on the new bill, is a new intent.
    onPay = () => Promise.resolve(makeBill({ version: 5, paid_total: '800.00', balance_due: '200.00' }))
    drawer = await openPayment(u, '400')
    await u.click(within(drawer).getByRole('button', { name: /^Charge/ }))
    await waitFor(() => expect(pays()).toHaveLength(3))
    expect(pays()[2]?.body.version).toBe(4)
    expect(pays()[2]?.key).not.toBe(pays()[0]?.key)
  })

  it('shows "Paid in full" with change from our own tender only when our own charge settled the bill', async () => {
    const u = user()
    setup()
    const drawer = await openPayment(u, '1000')
    await u.click(within(drawer).getByRole('radio', { name: 'Cash' }))
    await u.type(within(drawer).getByRole('textbox', { name: /Cash tendered/ }), '1500')
    onPay = (body) => {
      expect(body).toMatchObject({ version: 3, amount: '1000.00', tendered: '1500.00', payment_method_id: 1 })
      // The server's own record says 0 change; the drawer uses our tender, not someone's row.
      return Promise.resolve(makeBill({ version: 4, status: 'PAID', paid_total: '1000.00', balance_due: '0.00', payments: [cashPayment('1000.00', null, '0.00')] }))
    }
    await u.click(within(drawer).getByRole('button', { name: /^Charge/ }))
    const done = await screen.findByRole('dialog', { name: 'Bill settled' })
    expect(within(done).getByText('Paid in full')).toBeInTheDocument()
    expect(within(done).getByText('Give change')).toBeInTheDocument()
    expect(within(done).getByText(/500\.00/)).toBeInTheDocument()
  })

  it("closes with a neutral note when someone else's payment settles the bill — no 'Paid in full' and no change", async () => {
    const u = user()
    const { poll } = setup()
    await openPayment(u, '1000')
    server = makeBill({ version: 4, status: 'PAID', paid_total: '1000.00', balance_due: '0.00', payments: [cashPayment('1000.00', '2000.00', '1000.00')] })
    await poll()
    await gone('Take payment')
    await toasted('This bill was paid elsewhere')
    expect(screen.queryByText('Paid in full')).toBeNull()
    expect(screen.queryByText('Give change')).toBeNull()
    expect(pays()).toHaveLength(0)
  })

  it('closes with a neutral note when the bill is voided elsewhere', async () => {
    const u = user()
    const { poll } = setup()
    await openPayment(u, '1000')
    server = makeBill({ version: 4, status: 'VOID', void_reason: 'Wrong table' })
    await poll()
    await gone('Take payment')
    await toasted('This bill was voided')
  })

  it('closes when the bill changes under an open drawer, and says a payment may have landed only for our own lost charge', async () => {
    const u = user()
    const { poll } = setup()
    // Someone else's partial payment while our drawer is open: neutral.
    await openPayment(u, '100')
    server = makeBill({ version: 4, paid_total: '300.00', balance_due: '700.00' })
    await poll()
    await gone('Take payment')
    await toasted('This bill changed — check it before charging')

    // Our own charge, answer lost, then the bill moves: it may have been ours.
    const drawer = await openPayment(u, '100')
    onPay = () => Promise.reject(new ApiError('timeout', 'The request timed out.'))
    await u.click(within(drawer).getByRole('button', { name: /^Charge/ }))
    await waitFor(() => expect(pays()).toHaveLength(1))
    await waitFor(() => expect(within(drawer).getByRole('button', { name: /^Charge/ })).not.toHaveAttribute('aria-busy'))
    server = makeBill({ version: 5, paid_total: '400.00', balance_due: '600.00' })
    await poll()
    await gone('Take payment')
    await toasted('A payment was recorded. Check the balance before charging again.')
  })

  it('never closes the drawer while our charge is on the wire, and shows our own answer when it lands', async () => {
    const u = user()
    const { poll } = setup()
    const drawer = await openPayment(u, '1000')
    let answer: (b: Bill) => void = () => undefined
    onPay = () => new Promise<Bill>((resolve) => { answer = resolve })
    await u.click(within(drawer).getByRole('button', { name: /^Charge/ }))
    await waitFor(() => expect(pays()).toHaveLength(1))
    // Our payment lands; a poll sees it before our answer arrives.
    const paid = makeBill({ version: 4, status: 'PAID', paid_total: '1000.00', balance_due: '0.00' })
    server = paid
    await poll()
    expect(screen.getByRole('dialog', { name: 'Take payment' })).toBeInTheDocument()
    answer(paid)
    expect(await screen.findByText('Paid in full')).toBeInTheDocument()
    expect(screen.queryAllByText('This bill was paid elsewhere')).toHaveLength(0)
  })

  it('a charge refused as stale closes the drawer and explains', async () => {
    const u = user()
    setup()
    const drawer = await openPayment(u, '1000')
    onPay = () => {
      server = makeBill({ version: 4, discount_type: 'FIXED', discount_value: '100.00', discount_amount: '100.00', total: '900.00', balance_due: '900.00' })
      return Promise.reject(new ApiError('stale', 'This bill changed.', { status: 409, code: 'STALE_VERSION' }))
    }
    await u.click(within(drawer).getByRole('button', { name: /^Charge/ }))
    await gone('Take payment')
    await toasted(/This bill changed on another device/)
  })

  it('sends a refund with the version it was decided on, so a bill refunded elsewhere is refused, not refunded twice', async () => {
    const u = user()
    server = makeBill({
      status: 'PAID', paid_total: '1000.00', balance_due: '0.00', version: 5,
      payments: [{ ...cashPayment('1000.00', null, '0.00'), payment_method_id: 2, method_name: 'Card' }],
    })
    const { poll } = setup()
    await u.click(await screen.findByRole('button', { name: /^Refund$/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Refund' })
    await u.clear(within(drawer).getByRole('textbox', { name: 'Amount to refund' }))
    await u.type(within(drawer).getByRole('textbox', { name: 'Amount to refund' }), '200')
    await u.type(within(drawer).getByRole('textbox', { name: 'Reason' }), 'dish returned')
    // Another device refunds part of the card payment; Card is still refundable here.
    server = { ...server, version: 6, status: 'PARTIALLY_REFUNDED', refunded_total: '300.00',
      payments: [...server.payments, { ...cashPayment('300.00', null, '0.00'), id: 51, kind: 'REFUND', payment_method_id: 2, method_name: 'Card' }] }
    await poll()
    await u.click(within(drawer).getByRole('button', { name: /^Refund ₹/ }))
    onRefund = () => Promise.reject(new ApiError('stale', 'This bill changed.', { status: 409, code: 'STALE_VERSION' }))
    await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Refund' }))
    await waitFor(() => expect(posts.filter((p) => p.path === '/bills/7/refunds')).toHaveLength(1))
    expect(posts[0]?.body).toMatchObject({ version: 5, payment_method_id: 2, amount: '200.00' })
    await gone('Refund')
    await toasted(/This bill changed on another device/)
  })
})
