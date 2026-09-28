/**
 * One mapping from state to label/tone/icon (Android's StatusVisuals.kt), so every screen
 * shows a status the same way. Unknown values from a newer server render neutrally.
 */
import {
  Ban, CalendarCheck, CheckCircle2, CircleHelp, CircleMinus, ConciergeBell, Flame, Hourglass,
  MoveRight, SprayCan, Undo2, Users, CircleCheckBig, type LucideIcon,
} from 'lucide-react'
import type { Tone } from './tone'

export interface StatusVisual {
  label: string
  tone: Tone
  icon: LucideIcon
}

const unknown: StatusVisual = { label: 'Unknown', tone: 'neutral', icon: CircleHelp }

const TABLE: Record<string, StatusVisual> = {
  AVAILABLE: { label: 'Available', tone: 'success', icon: CheckCircle2 },
  OCCUPIED: { label: 'Occupied', tone: 'accent', icon: Users },
  RESERVED: { label: 'Reserved', tone: 'info', icon: CalendarCheck },
  CLEANING: { label: 'Cleaning', tone: 'cleaning', icon: SprayCan },
  BLOCKED: { label: 'Blocked', tone: 'neutral', icon: Ban },
}

const TICKET: Record<string, StatusVisual> = {
  NEW: { label: 'New', tone: 'info', icon: ConciergeBell },
  ACCEPTED: { label: 'Accepted', tone: 'info', icon: Hourglass },
  PREPARING: { label: 'Preparing', tone: 'warning', icon: Flame },
  READY: { label: 'Ready', tone: 'success', icon: CircleCheckBig },
  COMPLETED: { label: 'Served', tone: 'neutral', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', tone: 'danger', icon: CircleMinus },
}

const ITEM: Record<string, StatusVisual> = {
  PENDING: { label: 'Not sent', tone: 'warning', icon: MoveRight },
  SENT: { label: 'In kitchen', tone: 'info', icon: ConciergeBell },
  PREPARING: { label: 'Preparing', tone: 'warning', icon: Flame },
  READY: { label: 'Ready', tone: 'success', icon: CircleCheckBig },
  SERVED: { label: 'Served', tone: 'neutral', icon: CheckCircle2 },
  VOIDED: { label: 'Voided', tone: 'danger', icon: Undo2 },
}

const ORDER: Record<string, StatusVisual> = {
  OPEN: { label: 'Open', tone: 'accent', icon: ConciergeBell },
  BILLED: { label: 'Bill issued', tone: 'info', icon: Hourglass },
  CLOSED: { label: 'Closed', tone: 'success', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', tone: 'danger', icon: CircleMinus },
  MERGED: { label: 'Merged', tone: 'neutral', icon: MoveRight },
}

const BILL: Record<string, StatusVisual> = {
  OPEN: { label: 'Awaiting payment', tone: 'warning', icon: Hourglass },
  PAID: { label: 'Paid', tone: 'success', icon: CheckCircle2 },
  PARTIALLY_REFUNDED: { label: 'Part refunded', tone: 'info', icon: Undo2 },
  REFUNDED: { label: 'Refunded', tone: 'neutral', icon: Undo2 },
  VOID: { label: 'Void', tone: 'danger', icon: CircleMinus },
}

export const tableVisual = (s: string): StatusVisual => TABLE[s] ?? unknown
export const ticketVisual = (s: string): StatusVisual => TICKET[s] ?? unknown
export const itemVisual = (s: string): StatusVisual => ITEM[s] ?? unknown
export const orderVisual = (s: string): StatusVisual => ORDER[s] ?? unknown
export const billVisual = (s: string): StatusVisual => BILL[s] ?? unknown

/** How late a kitchen ticket is. Calm, then warm, then hot — with words, not colour alone. */
export type Urgency = { tone: Tone; label: string }
export function urgencyFor(minutes: number): Urgency {
  if (minutes >= 20) return { tone: 'danger', label: 'Overdue' }
  if (minutes >= 10) return { tone: 'warning', label: 'Running late' }
  return { tone: 'neutral', label: 'On time' }
}
