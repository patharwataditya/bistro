import {
  Armchair, BookOpen, ChefHat, CreditCard, History, LayoutGrid, ReceiptText, Settings, Shield, UserRound,
  ClipboardList, type LucideIcon,
} from 'lucide-react'
import type { Tone } from '@/ui/tone'

export interface AuditKind {
  icon: LucideIcon
  tone: Tone
}

const BY_PREFIX: [string, AuditKind][] = [
  ['payment.', { icon: CreditCard, tone: 'success' }],
  ['bill.', { icon: ReceiptText, tone: 'accent' }],
  ['order.', { icon: ClipboardList, tone: 'info' }],
  ['kitchen.', { icon: ChefHat, tone: 'warning' }],
  ['staff.', { icon: UserRound, tone: 'warning' }],
  ['role.', { icon: Shield, tone: 'warning' }],
  ['menu.', { icon: BookOpen, tone: 'cleaning' }],
  ['table.', { icon: Armchair, tone: 'info' }],
  ['area.', { icon: LayoutGrid, tone: 'info' }],
  ['settings.', { icon: Settings, tone: 'neutral' }],
]

const BY_ENTITY: Record<string, AuditKind> = {
  order: { icon: ClipboardList, tone: 'info' },
  bill: { icon: ReceiptText, tone: 'accent' },
  user: { icon: UserRound, tone: 'warning' },
  role: { icon: Shield, tone: 'warning' },
  menu_item: { icon: BookOpen, tone: 'cleaning' },
  menu_category: { icon: BookOpen, tone: 'cleaning' },
  table: { icon: Armchair, tone: 'info' },
  table_area: { icon: LayoutGrid, tone: 'info' },
  location: { icon: Settings, tone: 'neutral' },
  payment_method: { icon: Settings, tone: 'neutral' },
}

const FALLBACK: AuditKind = { icon: History, tone: 'neutral' }

/** Icon + tone for an audit action (the prefix wins; the entity type is the fallback). */
export function auditKind(action: string, entityType?: string | null): AuditKind {
  for (const [prefix, kind] of BY_PREFIX) if (action.startsWith(prefix)) return kind
  return (entityType ? BY_ENTITY[entityType] : undefined) ?? FALLBACK
}
