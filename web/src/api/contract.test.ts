import contract from '../../../contract/enums.json'
import { ALL_PERMISSIONS } from '@/auth/permissions'
import { fromResponse } from './errors'
import {
  BILL_STATUSES,
  DISCOUNT_TYPES,
  ITEM_STATUSES,
  ORDER_STATUSES,
  PAYMENT_KINDS,
  TABLE_STATUSES,
  TICKET_STATUSES,
} from './types'

// contract/enums.json is shared with the backend and Android; each side fails its own tests on drift.
describe('shared contract', () => {
  it.each([
    ['TableStatus', TABLE_STATUSES],
    ['OrderStatus', ORDER_STATUSES],
    ['OrderItemStatus', ITEM_STATUSES],
    ['TicketStatus', TICKET_STATUSES],
    ['BillStatus', BILL_STATUSES],
    ['DiscountType', DISCOUNT_TYPES],
    ['PaymentKind', PAYMENT_KINDS],
  ] as const)('%s matches', (name, values) => {
    expect([...values]).toEqual(contract[name])
  })

  it('knows every permission', () => {
    expect([...ALL_PERMISSIONS].sort()).toEqual([...contract.Permission].sort())
  })

  it('maps every error code to a specific kind', () => {
    for (const code of contract.ErrorCode) {
      const error = fromResponse(418, { error: { code, message: 'm' } })
      expect(error.kind, code).not.toBe('unexpected')
      expect(error.code).toBe(code)
    }
  })
})
