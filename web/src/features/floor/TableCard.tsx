import { Armchair, Pointer } from 'lucide-react'
import type { DiningTable } from '@/api/types'
import { money } from '@/lib/format'
import { MiniFlag, StatusChip } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { TONE } from '@/ui/tone'
import { isSeatable, orderLine, tableChip, tableDescription, tableFlag } from './floorModel'

/**
 * A table at a glance: name and seats, status (icon + word + stripe), and for an occupied
 * table the check number, covers, time seated, running total and what needs doing.
 */
export function TableCard({ table, now, currency, canSeat, selected, onOpen, onActions }: {
  table: DiningTable
  now: number
  currency: string
  canSeat: boolean
  selected?: boolean
  onOpen: () => void
  /** Right-click: the table's actions, like Android's long-press. */
  onActions: () => void
}) {
  const chip = tableChip(table)
  const order = table.active_order
  const flag = tableFlag(order)
  return (
    <button
      type="button"
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault()
        onActions()
      }}
      aria-label={tableDescription(table, now, currency)}
      aria-haspopup="dialog"
      aria-current={selected || undefined}
      className={cn(
        'group relative flex min-h-[136px] w-full overflow-hidden rounded-[var(--radius-lg)] border bg-surface text-left shadow-card focus-visible:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--accent)]',
        'transition-[border-color,transform,background-color] duration-150 ease-[var(--ease-standard)] hover:border-line-strong active:scale-[0.98]',
        selected ? 'border-fg' : 'border-line',
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 transition-colors group-hover:bg-[var(--hover-overlay)]" />
      <span aria-hidden className={cn('my-4 ml-0 w-1 shrink-0 rounded-r-full transition-colors duration-200', TONE[chip.tone].stripe)} />
      <span aria-hidden className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3">
        <span className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2">
            <span className="t-table-label min-w-0 flex-1 truncate text-fg">{table.name}</span>
            <span className="t-meta inline-flex shrink-0 items-center gap-1 text-fg3">
              <Armchair className="size-3.5" strokeWidth={1.75} />
              {table.capacity}
            </span>
          </span>
          <span className="flex">
            <StatusChip label={chip.label} tone={chip.tone} icon={chip.icon} />
          </span>
        </span>
        {order ? (
          <span className="flex flex-col gap-0.5">
            <span className="t-meta truncate text-fg2">{orderLine(order, now)}</span>
            <span className="flex items-center gap-1.5">
              <span className="t-amount-sm min-w-0 truncate text-fg">{money(order.subtotal, currency)}</span>
              {flag && <MiniFlag text={flag.text} tone={flag.tone} />}
            </span>
          </span>
        ) : (
          <span className="flex flex-col gap-0.5">
            {table.status_note && <span className="t-meta line-clamp-2 text-fg2">{table.status_note}</span>}
            {canSeat && isSeatable(table.status) && (
              <span className="t-meta inline-flex items-center gap-1 text-fg3">
                <Pointer className="size-3" strokeWidth={1.75} />
                <span className="pointer-coarse:hidden">Click to seat</span>
                <span className="hidden pointer-coarse:inline">Tap to seat</span>
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  )
}
