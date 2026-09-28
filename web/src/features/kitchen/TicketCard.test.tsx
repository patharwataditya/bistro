import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Ticket } from '@/api/types'
import { TicketCard } from './TicketCard'

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 9, ticket_number: 9, status: 'NEW', order_id: 1, order_number: 12, order_status: 'OPEN', order_notes: 'Birthday table',
    table_name: 'T2', server_name: 'Sofia Server', fired_at: new Date().toISOString(), accepted_at: null, started_at: null,
    ready_at: null, completed_at: null, version: 3,
    items: [
      { id: 1, name: 'Paneer Tikka', quantity: 2, notes: 'Extra spicy', status: 'SENT' },
      { id: 2, name: 'Cold Brew', quantity: 1, notes: null, status: 'VOIDED' },
    ],
    ...over,
  }
}

describe('TicketCard', () => {
  it('shows the table, check, ticket, items, notes and a VOID flag', () => {
    render(<TicketCard ticket={ticket()} zone="UTC" canUpdate busyTo={undefined} onAction={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'T2' })).toBeInTheDocument()
    expect(screen.getByText('Check #12')).toBeInTheDocument()
    expect(screen.getByText('Ticket 9 · Sofia Server')).toBeInTheDocument()
    expect(screen.getByText('Extra spicy')).toBeInTheDocument()
    expect(screen.getByText('VOID')).toBeInTheDocument()
    expect(screen.getByText('Birthday table')).toBeInTheDocument()
    expect(screen.getByText('WAITING · ON TIME')).toBeInTheDocument()
  })

  it('sends the chosen transition', async () => {
    const onAction = vi.fn()
    const t = ticket()
    render(<TicketCard ticket={t} zone="UTC" canUpdate busyTo={undefined} onAction={onAction} />)
    await userEvent.click(screen.getByRole('button', { name: /^Start/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Accept/ }))
    expect(onAction.mock.calls).toEqual([[t, 'PREPARING'], [t, 'ACCEPTED']])
  })

  it('locks only this ticket while its request is in flight', () => {
    render(<TicketCard ticket={ticket()} zone="UTC" canUpdate busyTo="PREPARING" onAction={() => undefined} />)
    expect(screen.getByRole('button', { name: /^Start/ })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: /^Accept/ })).toBeDisabled()
  })

  it('hides actions without kitchen.update, and for cancelled checks; flags paid checks', () => {
    const { rerender } = render(<TicketCard ticket={ticket()} zone="UTC" canUpdate={false} busyTo={undefined} onAction={() => undefined} />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<TicketCard ticket={ticket({ order_status: 'CANCELLED' })} zone="UTC" canUpdate busyTo={undefined} onAction={() => undefined} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    rerender(<TicketCard ticket={ticket({ status: 'READY', order_status: 'CLOSED' })} zone="UTC" canUpdate busyTo={undefined} onAction={() => undefined} />)
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Served/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Recall/ })).toBeInTheDocument()
  })
})
