import {
  BookOpen, ChefHat, ClipboardList, History, LayoutDashboard, LineChart, ReceiptText, Settings, Shield,
  Armchair, Users, UtensilsCrossed, type LucideIcon,
} from 'lucide-react'
import type { Grants, Permission } from '@/auth/permissions'
import { P } from '@/auth/permissions'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Visible when the user holds ANY of these (empty = everyone). */
  any: Permission[]
  /** Shown in the narrow-screen bottom bar (Android's top-level tabs). */
  primary?: boolean
}

/** The Android top-level tabs first, then the Android "More" links, same gates. */
export const OPERATIONS: NavItem[] = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard, any: [P.DASHBOARD_VIEW], primary: true },
  { to: '/floor', label: 'Floor', icon: UtensilsCrossed, any: [P.TABLES_VIEW], primary: true },
  { to: '/orders', label: 'Orders', icon: ClipboardList, any: [P.ORDERS_VIEW] },
  { to: '/kitchen', label: 'Kitchen', icon: ChefHat, any: [P.KITCHEN_VIEW], primary: true },
  { to: '/bills', label: 'Bills', icon: ReceiptText, any: [P.BILLING_VIEW], primary: true },
]

export const MANAGE: NavItem[] = [
  { to: '/menu', label: 'Menu', icon: BookOpen, any: [P.MENU_VIEW] },
  { to: '/tables', label: 'Tables & areas', icon: Armchair, any: [P.TABLES_UPDATE, P.TABLES_CREATE, P.TABLES_DELETE] },
  { to: '/reports', label: 'Reports', icon: LineChart, any: [P.REPORTS_VIEW] },
  { to: '/staff', label: 'Staff', icon: Users, any: [P.STAFF_VIEW] },
  { to: '/roles', label: 'Roles & permissions', icon: Shield, any: [P.ROLES_VIEW] },
  { to: '/settings', label: 'Restaurant settings', icon: Settings, any: [P.SETTINGS_VIEW] },
  { to: '/audit', label: 'Audit log', icon: History, any: [P.AUDIT_LOGS_VIEW] },
]

export function visible(items: NavItem[], grants: Grants): NavItem[] {
  return items.filter((i) => i.any.length === 0 || grants.any(...i.any))
}

/** Where to land after sign-in: the first operations page this user may see. */
export function homePath(grants: Grants): string {
  return visible(OPERATIONS, grants)[0]?.to ?? visible(MANAGE, grants)[0]?.to ?? '/account'
}
