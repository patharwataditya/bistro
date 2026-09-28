import type { UseQueryResult } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/errors'
import type { Bill, PaymentMethod } from '@/api/types'
import { PaymentDrawer } from './PaymentDrawer'

const METHODS: PaymentMethod[] = [
  { id: 1, name: 'Cash', is_cash: true, is_active: true, sort_order: 0 },
  { id: 2, name: 'Card', is_cash: false, is_active: true, sort_order: 1 },
  { id: 3, name: 'Old voucher', is_cash: false, is_active: false, sort_order: 2 },
]
const methods = { isPending: false, isError: false, data: METHODS, error: null, refetch: vi.fn() } as unknown as UseQueryResult<PaymentMethod[], ApiError>

const bill = {
  id: 7, bill_number: 'B-0007', table_name: 'T4', currency_code: 'INR', balance_due: '1000.00', total: '1000.00', status: 'OPEN', payments: [],
} as unknown as Bill

function renderDrawer(onCharge = vi.fn()) {
  render(<PaymentDrawer open bill={bill} settled={null} busy={false} methods={methods} onClose={() => undefined} onCharge={onCharge} />)
  return onCharge
}

const amount = () => screen.getByRole('textbox', { name: 'Amount' })
const charge = () => screen.getByRole('button', { name: /^Charge/ })

describe('PaymentDrawer', () => {
  it('offers only active methods and starts with the balance due', () => {
    renderDrawer()
    expect(within(screen.getByRole('radiogroup', { name: 'Payment method' })).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Cash', 'Card'])
    expect(amount()).toHaveValue('1000.00')
    expect(charge()).toBeEnabled()
  })

  it('refuses zero and more than is due', async () => {
    const u = userEvent.setup()
    renderDrawer()
    await u.clear(amount())
    await u.type(amount(), '0')
    expect(screen.getByText('Enter an amount above zero')).toBeInTheDocument()
    expect(charge()).toBeDisabled()
    await u.clear(amount())
    await u.type(amount(), '1000.01')
    expect(screen.getByText(/That's more than the .*1,000\.00 due/)).toBeInTheDocument()
    expect(charge()).toBeDisabled()
    await u.clear(amount())
    await u.type(amount(), '400')
    expect(screen.getByText(/Split payment · .*600\.00 will remain due/)).toBeInTheDocument()
    expect(charge()).toBeEnabled()
  })

  it('checks cash tendered and shows the change', async () => {
    const u = userEvent.setup()
    const onCharge = renderDrawer()
    await u.type(screen.getByRole('textbox', { name: /Cash tendered/ }), '900')
    expect(screen.getByText('Less than the amount being paid')).toBeInTheDocument()
    expect(charge()).toBeDisabled()
    await u.clear(screen.getByRole('textbox', { name: /Cash tendered/ }))
    await u.type(screen.getByRole('textbox', { name: /Cash tendered/ }), '1200')
    expect(screen.getByText('Change due')).toBeInTheDocument()
    await u.click(charge())
    expect(onCharge).toHaveBeenCalledWith({ method: METHODS[0], amount: '1000.00', tendered: '1200.00', reference: null })
  })

  it('sends a trimmed reference for non-cash methods, and no tender', async () => {
    const u = userEvent.setup()
    const onCharge = renderDrawer()
    await u.click(screen.getByRole('radio', { name: 'Card' }))
    expect(screen.queryByRole('textbox', { name: /Cash tendered/ })).toBeNull()
    await u.type(screen.getByRole('textbox', { name: /Reference/ }), '  slip 42  ')
    await u.click(charge())
    expect(onCharge).toHaveBeenCalledWith({ method: METHODS[1], amount: '1000.00', tendered: null, reference: 'slip 42' })
  })

  it('does nothing while a charge is in flight', async () => {
    const onCharge = vi.fn()
    render(<PaymentDrawer open bill={bill} settled={null} busy methods={methods} onClose={() => undefined} onCharge={onCharge} />)
    await userEvent.click(screen.getByRole('button', { name: /^Charge/ }))
    expect(onCharge).not.toHaveBeenCalled()
  })
})
