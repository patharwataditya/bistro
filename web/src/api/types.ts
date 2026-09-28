/**
 * Domain types, taken from the generated OpenAPI schema so they can't drift from the API.
 * State unions are tightened here from plain `string` and checked against contract/enums.json
 * by a test. Unknown values from a newer server fall back to neutral rendering in the UI.
 */
import type { components } from './schema'

type S = components['schemas']

export const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'BLOCKED'] as const
export const ORDER_STATUSES = ['OPEN', 'BILLED', 'CLOSED', 'CANCELLED', 'MERGED'] as const
export const ITEM_STATUSES = ['PENDING', 'SENT', 'PREPARING', 'READY', 'SERVED', 'VOIDED'] as const
export const TICKET_STATUSES = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'] as const
export const BILL_STATUSES = ['OPEN', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOID'] as const
export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'] as const
export const PAYMENT_KINDS = ['PAYMENT', 'REFUND'] as const

export type TableStatus = (typeof TABLE_STATUSES)[number]
export type OrderStatus = (typeof ORDER_STATUSES)[number]
export type ItemStatus = (typeof ITEM_STATUSES)[number]
export type TicketStatus = (typeof TICKET_STATUSES)[number]
export type BillStatus = (typeof BILL_STATUSES)[number]
export type DiscountType = (typeof DISCOUNT_TYPES)[number]

/** Money is a decimal string ("893.02") end to end; the browser never does money math. */
export type Money = string

export type Me = S['MeOut']
export type Floor = S['FloorOut']
export type DiningTable = S['TableOut']
export type ActiveOrderBrief = S['ActiveOrderBrief']
export type Area = S['AreaOut']
export type Menu = S['MenuOut']
export type MenuItem = S['MenuItemOut']
export type MenuCategory = S['CategoryOut']
export type Order = S['OrderOut']
export type OrderItem = S['OrderItemOut']
export type OrderSummary = S['OrderSummary']
export type Totals = S['TotalsOut']
export type TaxLine = S['TaxLineOut']
export type KitchenBoard = S['KitchenBoardOut']
export type Ticket = S['TicketOut']
export type Bill = S['BillOut']
export type BillSummary = S['BillSummary']
export type PaymentRecord = S['PaymentOut']
export type PaymentMethod = S['PaymentMethodOut']
export type StaffMember = S['UserOut']
export type Role = S['RoleOut']
export type PermissionInfo = S['PermissionOut']
export type RestaurantSettings = S['SettingsOut']
export type Dashboard = S['DashboardOut']
export type Report = S['ReportOut']
export type AuditPage = S['AuditPage']
export type AuditEntry = S['AuditLogOut']
export type WebSession = S['WebSession']

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export function isKnown<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value)
}
