import { NotebookPen, Trash2 } from 'lucide-react'
import type { OrderItem } from '@/api/types'
import { money } from '@/lib/format'
import { Button, IconButton } from '@/ui/Button'
import { StatusChip } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { Stepper } from '@/ui/Controls'
import { itemVisual } from '@/ui/status'
import { MAX_QTY } from './orderModel'

function Note({ text }: { text: string }) {
  return <p className="t-support mt-0.5 break-words text-accent italic">“{text}”</p>
}

/** A line not yet sent: quantity, note and remove are still editable. */
export function PendingItemRow({ item, quantity, currency, editable, busy, unsaved = false, onRetry, onQuantity, onNote, onRemove }: {
  item: OrderItem
  quantity: number
  currency: string
  editable: boolean
  busy: boolean
  /** The quantity shown couldn't be saved yet (it is retried). */
  unsaved?: boolean
  onRetry?: () => void
  onQuantity: (q: number) => void
  onNote: () => void
  onRemove: () => void
}) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="t-body-strong break-words text-fg">
            {!editable && <span className="t-amount mr-1.5 text-fg2">{item.quantity}×</span>}
            {item.name}
          </p>
          {item.notes && <Note text={item.notes} />}
        </div>
        <span className="t-amount shrink-0 text-fg">{money(item.line_total, currency)}</span>
      </div>
      {unsaved && (
        <p role="status" className="t-meta flex flex-wrap items-center gap-x-2 text-warning">
          <span>{quantity} not saved yet — retrying</span>
          {onRetry && <button type="button" onClick={onRetry} className="t-meta min-h-10 font-semibold underline underline-offset-2">Retry now</button>}
        </p>
      )}
      {editable && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={NotebookPen} onClick={onNote} disabled={busy} className="-ml-2 text-fg2">
            {item.notes ? 'Edit note' : 'Add note'}
          </Button>
          <IconButton icon={Trash2} label={`Remove ${item.name}`} tone="danger" onClick={onRemove} disabled={busy} className="size-9" />
          <span className="ml-auto">
            <Stepper value={quantity} onChange={onQuantity} min={1} max={MAX_QTY} label={item.name} compact />
          </span>
        </div>
      )}
    </li>
  )
}

/** A line the kitchen has: status, and Serve / Void when allowed. */
export function FiredItemRow({ item, currency, canServe, canVoid, serving, onServe, onVoid }: {
  item: OrderItem
  currency: string
  canServe: boolean
  canVoid: boolean
  serving: boolean
  onServe: () => void
  onVoid: () => void
}) {
  const voided = item.status === 'VOIDED'
  const v = itemVisual(item.status)
  const showChip = !voided && item.status !== 'SERVED' && !canServe
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn('t-body-strong break-words', voided ? 'text-fg3 line-through' : 'text-fg')}>
            <span className={cn('t-amount mr-1.5', voided ? 'text-fg3' : 'text-fg2')}>{item.quantity}×</span>
            {item.name}
          </p>
          {item.notes && <Note text={item.notes} />}
          {voided && item.void_reason && <p className="t-meta mt-0.5 text-danger">{item.void_reason}</p>}
        </div>
        <span className={cn('t-amount shrink-0', voided ? 'text-fg3 line-through' : 'text-fg')}>{money(item.line_total, currency)}</span>
      </div>
      {(showChip || canServe || canVoid) && (
        <div className="flex items-center gap-2">
          {showChip && <StatusChip label={v.label} tone={v.tone} icon={v.icon} />}
          <span className="ml-auto flex items-center gap-1">
            {canVoid && <Button variant="ghost" size="sm" onClick={onVoid} aria-label={`Void ${item.name}`}>Void</Button>}
            {canServe && <Button size="sm" onClick={onServe} loading={serving} aria-label={`Serve ${item.name}`}>Serve</Button>}
          </span>
        </div>
      )}
    </li>
  )
}
