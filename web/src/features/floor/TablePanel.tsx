import { Check, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { keys } from '@/api/queries'
import type { DiningTable, Floor } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { useAction } from '@/features/common/useAction'
import { elapsed, money } from '@/lib/format'
import { IntentKey } from '@/lib/idempotency'
import { Button } from '@/ui/Button'
import { MiniFlag, StatusChip } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { Stepper } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { Divider, Drawer } from '@/ui/Overlay'
import { orderVisual, tableVisual } from '@/ui/status'
import { useToast } from '@/ui/Toast'
import { TONE } from '@/ui/tone'
import { floorApi } from './api'
import {
  defaultGuests, guestsLabel, isManualStatus, isSeatable, MANUAL_STATUSES, seatFingerprint,
  type ManualStatus,
} from './floorModel'

/**
 * The web counterpart of Android's seat and table-actions sheets, in one side panel:
 * open the order, seat guests, or set the table's status by hand.
 */
export function TablePanel({ table, now, currency, onClose }: {
  table: DiningTable | null
  now: number
  currency: string
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Drawer
      open={table !== null}
      onOpenChange={(o) => !o && onClose()}
      title={table ? `Table ${table.name}` : ''}
      description={table ? panelSubtitle(table) : undefined}
      busy={busy}
      width={420}
    >
      {table && <PanelBody key={table.id} table={table} now={now} currency={currency} onClose={onClose} onBusy={setBusy} />}
    </Drawer>
  )
}

function panelSubtitle(t: DiningTable): string {
  return [`${t.capacity} seats`, t.area_name, `currently ${tableVisual(t.status).label.toLowerCase()}`].filter(Boolean).join(' · ')
}

function PanelBody({ table, now, currency, onClose, onBusy }: {
  table: DiningTable
  now: number
  currency: string
  onClose: () => void
  onBusy: (busy: boolean) => void
}) {
  const { can } = useMe()
  const order = table.active_order
  const canSeat = can(P.ORDERS_CREATE) && isSeatable(table.status) && !order
  const canManage = can(P.TABLES_MANAGE_STATUS)

  if (order) {
    return <OccupiedSummary table={table} now={now} currency={currency} canManage={canManage} />
  }
  return (
    <div className="flex flex-col gap-6 pb-4">
      {canSeat && <SeatForm table={table} onBusy={onBusy} />}
      {canSeat && canManage && <Divider />}
      {canManage ? (
        <StatusEditor table={table} onClose={onClose} onBusy={onBusy} compact={canSeat} />
      ) : (
        !canSeat && <p className="t-body text-fg2">You can't change table status. Ask a manager.</p>
      )}
    </div>
  )
}

function OccupiedSummary({ table, now, currency, canManage }: { table: DiningTable; now: number; currency: string; canManage: boolean }) {
  const { can } = useMe()
  const navigate = useNavigate()
  const order = table.active_order
  if (!order) return null
  const v = orderVisual(order.status)
  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="rounded-[var(--radius-lg)] border border-line bg-sunken/60 p-4">
        <div className="flex items-center gap-2">
          <span className="t-identifier text-fg2">Check #{order.order_number}</span>
          <span className="ml-auto"><StatusChip label={v.label} tone={v.tone} icon={v.icon} /></span>
        </div>
        <div className="t-amount-lg mt-3 text-fg">{money(order.subtotal, currency)}</div>
        <div className="t-meta mt-0.5 text-fg3">Subtotal so far</div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
          <Fact label="Guests" value={guestsLabel(order.guest_count)} />
          <Fact label="Seated" value={elapsed(order.opened_at, now)} />
          <Fact label="Server" value={order.server_name} />
          <Fact label="Items" value={String(order.item_count)} />
        </dl>
        {(order.ready_count > 0 || order.pending_count > 0) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {order.ready_count > 0 && <MiniFlag text={`${order.ready_count} ready to serve`} tone="success" />}
            {order.pending_count > 0 && <MiniFlag text={`${order.pending_count} not sent`} tone="warning" />}
          </div>
        )}
      </div>
      {can(P.ORDERS_VIEW) && (
        <Button size="lg" className="w-full" onClick={() => navigate(`/orders/${order.id}`)}>Open order</Button>
      )}
      {canManage && (
        <p className="t-support text-fg2">
          This table has an open order. Its status follows the order: it frees up when the bill is paid or the order is moved.
        </p>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="t-status text-fg3">{label}</dt>
      <dd className="t-body-strong truncate text-fg">{value}</dd>
    </div>
  )
}

function SeatForm({ table, onBusy }: { table: DiningTable; onBusy: (b: boolean) => void }) {
  const navigate = useNavigate()
  const [guests, setGuests] = useState(() => defaultGuests(table.capacity))
  const [intent] = useState(() => new IntentKey())
  const seat = useAction(
    (v: { tableId: number; guests: number; key: string }) => floorApi.seat(v.tableId, v.guests, v.key),
    {
      invalidate: [keys.floor],
      success: `${table.name} is open`,
      onSuccess: (order) => {
        intent.reset()
        navigate(`/orders/${order.id}`)
      },
    },
  )
  const submit = () => {
    onBusy(true)
    seat.mutate(
      { tableId: table.id, guests, key: intent.keyFor(seatFingerprint(table, guests)) },
      { onSettled: () => onBusy(false) },
    )
  }
  const v = tableVisual(table.status)
  return (
    <section aria-labelledby="seat-h" className="flex flex-col gap-4">
      <h3 id="seat-h" className="t-card-title text-fg">Seat guests</h3>
      {table.status !== 'AVAILABLE' && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label={v.label} tone={v.tone} icon={v.icon} />
          <span className="t-support text-fg2">
            {table.status === 'RESERVED' ? 'Seating here will use the reservation.' : 'Make sure the table is ready.'}
          </span>
        </div>
      )}
      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-sunken p-4">
        <Users aria-hidden className="size-5 shrink-0 text-fg2" />
        <div className="min-w-0 flex-1">
          <div className="t-body-strong text-fg">Guests</div>
          {guests > table.capacity && <div className="t-meta text-warning" role="status">More than the {table.capacity} seats</div>}
        </div>
        <Stepper value={guests} onChange={setGuests} min={1} max={100} label="Guests" />
      </div>
      <Button variant="accent" size="lg" className="w-full" loading={seat.isPending} onClick={submit} trailing={`· ${guestsLabel(guests)}`}>
        Open table
      </Button>
    </section>
  )
}

function StatusEditor({ table, onClose, onBusy, compact }: {
  table: DiningTable
  onClose: () => void
  onBusy: (b: boolean) => void
  /** Shown under the seat form: a heading and an inline save instead of a footer pair. */
  compact: boolean
}) {
  const groupId = useId()
  const qc = useQueryClient()
  const toast = useToast()
  const [choice, setChoice] = useState<ManualStatus | null>(() => (isManualStatus(table.status) ? table.status : null))
  const [note, setNote] = useState(table.status_note ?? '')
  // The table as it was when this editor opened: a change made meanwhile on another device
  // must come back as a conflict, not be silently overwritten by the next poll's version.
  const [version, setVersion] = useState(table.version)
  const [stale, setStale] = useState(false)
  const save = useAction(
    (v: { status: ManualStatus; note: string | null }) => floorApi.setStatus(table.id, version, v.status, v.note),
    {
      invalidate: [keys.floor],
      success: (t) => `${t.name} marked ${tableVisual(t.status).label.toLowerCase()}`,
      onSuccess: () => onClose(),
      toastError: false,
      onError: (err) => {
        if (err.kind !== 'stale') {
          if (err.kind !== 'session-ended') toast.error(err.message)
          return
        }
        setStale(true)
        void qc.refetchQueries({ queryKey: keys.floor }).then(() => {
          const fresh = qc.getQueryData<Floor>(keys.floor)?.tables.find((t) => t.id === table.id)
          if (fresh) setVersion(fresh.version)
        })
      },
    },
  )
  const changed = choice !== null && (stale || choice !== table.status || note !== (table.status_note ?? ''))
  const submit = () => {
    if (!choice) return
    onBusy(true)
    const trimmed = note.trim()
    save.mutate({ status: choice, note: choice === 'AVAILABLE' || trimmed === '' ? null : trimmed }, { onSettled: () => onBusy(false) })
  }
  return (
    <section aria-labelledby={`${groupId}-h`} className="flex flex-col gap-3">
      <h3 id={`${groupId}-h`} className="t-card-title text-fg">Table status</h3>
      {stale && (
        <p role="alert" className="t-support rounded-[var(--radius-md)] bg-warning-soft px-3 py-2 text-fg">
          Someone else changed this table while you were here — it's now {tableVisual(table.status).label.toLowerCase()}. Check your choice and save again.
        </p>
      )}
      <div role="radiogroup" aria-labelledby={`${groupId}-h`} className="flex flex-col gap-2">
        {MANUAL_STATUSES.map((s) => {
          const v = tableVisual(s)
          const selected = choice === s
          return (
            <label
              key={s}
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 transition-colors duration-150',
                'has-[:focus-visible]:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--accent)]',
                selected ? cn('border-current', TONE[v.tone].bg, TONE[v.tone].fg) : 'border-line hover:bg-[var(--hover-overlay)]',
              )}
            >
              <input type="radio" name={groupId} value={s} checked={selected} onChange={() => setChoice(s)} className="sr-only" />
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)]', TONE[v.tone].bg, TONE[v.tone].fg)}>
                <v.icon aria-hidden className="size-[18px]" />
              </span>
              <span className="t-body-strong flex-1 text-fg">{v.label}</span>
              {selected && <Check aria-hidden className="size-5" />}
            </label>
          )
        })}
      </div>
      {choice !== null && choice !== 'AVAILABLE' && (
        <TextField
          label={choice === 'RESERVED' ? 'Reservation (name, time)' : 'Note (optional)'}
          value={note}
          maxLength={120}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && changed && submit()}
        />
      )}
      <div className={cn('mt-1 flex gap-2', compact ? 'justify-end' : '')}>
        {!compact && <Button variant="secondary" className="flex-1" onClick={onClose} disabled={save.isPending}>Close</Button>}
        <Button variant={compact ? 'secondary' : 'primary'} className={compact ? '' : 'flex-[1.4]'} disabled={!changed} loading={save.isPending} onClick={submit}>
          Save status
        </Button>
      </div>
    </section>
  )
}
