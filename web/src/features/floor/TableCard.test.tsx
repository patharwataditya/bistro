import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DiningTable } from '@/api/types'
import { TableCard } from './TableCard'

const base: DiningTable = {
  id: 1, name: 'T4', capacity: 4, area_id: null, area_name: null, status: 'OCCUPIED', status_note: null, sort_order: 0, version: 1,
  active_order: {
    id: 9, order_number: 12, status: 'OPEN', guest_count: 3, opened_at: '2026-01-01T12:00:00Z', server_name: 'Sofia',
    item_count: 4, pending_count: 2, ready_count: 1, subtotal: '470.00', bill_id: null, version: 3,
  },
}
const now = new Date('2026-01-01T12:47:00Z').getTime()

describe('TableCard', () => {
  it('shows one flag (ready beats unsent) and the order line', () => {
    render(<TableCard table={base} now={now} currency="INR" canSeat onOpen={() => undefined} onActions={() => undefined} />)
    expect(screen.getByText('1 ready')).toBeInTheDocument()
    expect(screen.queryByText('2 unsent')).not.toBeInTheDocument()
    expect(screen.getByText('#12 · 3 guests · 47m')).toBeInTheDocument()
  })

  it('is one keyboard-operable button with a full spoken description', async () => {
    const onOpen = vi.fn()
    render(<TableCard table={base} now={now} currency="INR" canSeat onOpen={onOpen} onActions={() => undefined} />)
    const card = screen.getByRole('button', { name: /^Table T4, 4 seats, Occupied, order 12, 3 guests, seated 47m/ })
    card.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('invites seating at a free table', () => {
    render(<TableCard table={{ ...base, status: 'AVAILABLE', active_order: null }} now={now} currency="INR" canSeat onOpen={() => undefined} onActions={() => undefined} />)
    expect(screen.getByText('Click to seat')).toBeInTheDocument()
  })
})
