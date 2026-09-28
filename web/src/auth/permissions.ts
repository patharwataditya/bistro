/**
 * Permission codes (contract/enums.json, checked by a test). The UI uses them only to decide
 * what to show; the API authorises every request independently.
 */
export const P = {
  DASHBOARD_VIEW: 'dashboard.view',
  TABLES_VIEW: 'tables.view',
  TABLES_CREATE: 'tables.create',
  TABLES_UPDATE: 'tables.update',
  TABLES_DELETE: 'tables.delete',
  TABLES_MANAGE_STATUS: 'tables.manage_status',
  ORDERS_VIEW: 'orders.view',
  ORDERS_CREATE: 'orders.create',
  ORDERS_UPDATE: 'orders.update',
  ORDERS_CANCEL: 'orders.cancel',
  ORDERS_TRANSFER: 'orders.transfer',
  KITCHEN_VIEW: 'kitchen.view',
  KITCHEN_UPDATE: 'kitchen.update',
  BILLING_VIEW: 'billing.view',
  BILLING_CREATE: 'billing.create',
  BILLING_DISCOUNT: 'billing.discount',
  BILLING_VOID: 'billing.void',
  BILLING_PROCESS_PAYMENT: 'billing.process_payment',
  BILLING_REFUND: 'billing.refund',
  MENU_VIEW: 'menu.view',
  MENU_CREATE: 'menu.create',
  MENU_UPDATE: 'menu.update',
  MENU_SET_AVAILABILITY: 'menu.set_availability',
  MENU_DELETE: 'menu.delete',
  MENU_MANAGE_CATEGORIES: 'menu.manage_categories',
  STAFF_VIEW: 'staff.view',
  STAFF_CREATE: 'staff.create',
  STAFF_UPDATE: 'staff.update',
  STAFF_DEACTIVATE: 'staff.deactivate',
  ROLES_VIEW: 'roles.view',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',
  REPORTS_VIEW: 'reports.view',
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_UPDATE: 'settings.update',
  AUDIT_LOGS_VIEW: 'audit_logs.view',
} as const

export type Permission = (typeof P)[keyof typeof P]

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(P)

export class Grants {
  private readonly codes: ReadonlySet<string>
  constructor(codes: readonly string[]) {
    this.codes = new Set(codes)
  }
  can(permission: Permission): boolean {
    return this.codes.has(permission)
  }
  any(...permissions: Permission[]): boolean {
    return permissions.some((p) => this.codes.has(p))
  }
  get size(): number {
    return this.codes.size
  }
  has(code: string): boolean {
    return this.codes.has(code)
  }
}
