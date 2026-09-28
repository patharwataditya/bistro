import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Bill } from '@/api/types'
import { RefundForm } from './BillSheets'

type Row = Bill['payments'][number]
const row = (id: number, kind: 'PAYMENT' | 'REFUND', methodId: number, name: string, amount: string): Row => ({
  id, kind, payment_method_id: methodId, method_name: name, amount, tendered: null, change_due: '0.00', reference: null,
  reason: null, is_correction: false, created_by_name: 'Casey', created_at: '2026-09-28T10:00:00Z',
})

function paidBill(version: number, payments: Row[]): Bill {
  return {
    id: 7, bill_number: 'B-0007', status: 'PAID', order_id: 3, order_number: 12, table_name: 'T4', server_name: 'Sofia',
    guest_count: 2, currency_code: 'INR', subtotal: '628.00', discount_type: null, discount_value: null, discount_amount: '0.00',
    discount_reason: null, service_charge_percent: '0.00', service_charge_amount: '0.00', taxes: [], tax_total: '0.00',
    round_off: '0.00', total: '628.00', paid_total: '628.00', refunded_total: '0.00', balance_due: '0.00', payments,
    created_by_name: 'Casey', created_at: '2026-09-28T10:00:00Z', paid_at: '2026-09-28T10:10:00Z', voided_at: null, void_reason: null,
    version,
  }
}

const both = [row(1, 'PAYMENT', 2, 'Card', '300.00'), row(2, 'PAYMENT', 1, 'Cash', '328.00')]

describe('RefundForm', () => {
  it('when the chosen method is refunded elsewhere, clears the choice and closes the confirmation — never switches method', async () => {
    const u = userEvent.setup()
    const onRefund = vi.fn()
    const { rerender } = render(<RefundForm bill={paidBill(5, both)} busy={false} onRefund={onRefund} />)
    await u.click(screen.getByRole('radio', { name: /^Card/ }))
    await u.clear(screen.getByRole('textbox', { name: 'Amount to refund' }))
    await u.type(screen.getByRole('textbox', { name: 'Amount to refund' }), '200')
    await u.type(screen.getByRole('textbox', { name: 'Reason' }), 'dish returned')
    await u.click(screen.getByRole('button', { name: /^Refund ₹/ }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()

    // Another device refunds the whole card payment.
    rerender(<RefundForm bill={paidBill(6, [...both, row(3, 'REFUND', 2, 'Card', '300.00')])} busy={false} onRefund={onRefund} />)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent('Card has nothing left to refund')
    expect(screen.queryByRole('radio', { name: /^Card/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /^Cash/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('textbox', { name: 'Amount to refund' })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Refund' })).toBeDisabled()
    expect(onRefund).not.toHaveBeenCalled()

    // Choosing again decides on the bill as it is now.
    await u.click(screen.getByRole('radio', { name: /^Cash/ }))
    await u.click(screen.getByRole('button', { name: /^Refund ₹/ }))
    await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Refund' }))
    expect(onRefund).toHaveBeenCalledWith(expect.objectContaining({ methodId: 1, methodName: 'Cash' }), '328.00', 'dish returned', 6)
  })

  it('keeps the version it was decided on when the bill moves but the method is still there', async () => {
    const u = userEvent.setup()
    const onRefund = vi.fn()
    const { rerender } = render(<RefundForm bill={paidBill(5, both)} busy={false} onRefund={onRefund} />)
    await u.click(screen.getByRole('radio', { name: /^Card/ }))
    await u.type(screen.getByRole('textbox', { name: 'Reason' }), 'dish returned')
    rerender(<RefundForm bill={paidBill(6, both)} busy={false} onRefund={onRefund} />)
    await u.click(screen.getByRole('button', { name: /^Refund ₹/ }))
    await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Refund' }))
    expect(onRefund).toHaveBeenCalledWith(expect.objectContaining({ methodId: 2 }), '300.00', 'dish returned', 5)
  })
})
