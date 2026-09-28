import { ArrowRight, ReceiptText, Send, UtensilsCrossed } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { Order, OrderItem } from '@/api/types'
import { TotalsCard } from '@/features/common/Totals'
import { elapsed, money } from '@/lib/format'
import { Button } from '@/ui/Button'
import { StatusChip } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { Stepper } from '@/ui/Controls'
import { TextArea, TextField } from '@/ui/Field'
import { ConfirmDialog } from '@/ui/Overlay'
import { EmptyState, StaleBanner } from '@/ui/States'
import { orderVisual } from '@/ui/status'
import type { ApiError } from '@/api/errors'
import { orderApi } from './api'
import { FormDialog, QuickNotes } from './FormDialog'
import { FiredItemRow, PendingItemRow } from './ItemRows'
import { OrderActions } from './OrderActions'
import {
  appendNote, canVoidItem, cartCount, cartTotal, groupItems, hasLiveItems, lineKey, lineTotal, MAX_QTY, pendingUnits,
  QUICK_NOTES, type CartLine, type OrderAbilities,
} from './orderModel'
import { useOrderMutation } from './useOrderMutation'

export interface CartControls {
  lines: CartLine[]
  setLine: (key: string, quantity: number) => void
  clear: () => void
  submit: (send: boolean) => void
  submitting: 'add' | 'send' | null
}

/**
 * The check: header, new (unsent-to-server) items, the server's items by section, totals,
 * and a pinned footer with the one next step (send, bill, or payment).
 */
export function OrderPanel({ order, can: a, now, staleError, drafts, onQuantity, cart, onFire, firing, onBill, billing, className }: {
  order: Order
  can: OrderAbilities
  now: number
  staleError: ApiError | null
  drafts: ReadonlyMap<number, number>
  onQuantity: (itemId: number, q: number) => void
  cart: CartControls | null
  onFire: () => void
  firing: boolean
  onBill: () => void
  billing: boolean
  className?: string
}) {
  const navigate = useNavigate()
  const currency = order.currency_code
  const v = orderVisual(order.status)
  const sections = groupItems(order.items, drafts)
  const pending = pendingUnits(order.items, drafts)
  const live = hasLiveItems(order.items)
  const cartLines = cart?.lines ?? []

  const [noteFor, setNoteFor] = useState<OrderItem | null>(null)
  const [voidFor, setVoidFor] = useState<OrderItem | null>(null)
  const [reason, setReason] = useState('')

  const serve = useOrderMutation(order.id, (item: OrderItem) => orderApi.serveItem(order.id, item.id), {
    success: (_, item) => `${item.name} served`,
  })
  const voidItem = useOrderMutation(order.id, (x: { item: OrderItem; reason: string }) => orderApi.voidItem(order.id, x.item.id, x.reason), {
    success: (_, x) => `${x.item.name} voided`,
    onSuccess: () => {
      setVoidFor(null)
      setReason('')
    },
  })
  const remove = useOrderMutation(order.id, (item: OrderItem) => orderApi.removeItem(order.id, item.id), {
    success: (_, item) => `${item.name} removed`,
    onSuccess: () => setNoteFor(null),
  })
  const saveNote = useOrderMutation(order.id, (x: { item: OrderItem; note: string }) => orderApi.updateItem(order.id, x.item.id, { notes: x.note.trim() }), {
    onSuccess: () => setNoteFor(null),
  })
  const itemBusy = (id: number) =>
    (remove.isPending && remove.variables?.id === id) || (saveNote.isPending && saveNote.variables?.item.id === id)

  return (
    <aside aria-label={`Check #${order.order_number}`} className={cn('flex min-h-0 flex-col rounded-[var(--radius-lg)] border border-line bg-surface shadow-card', className)}>
      <header className="shrink-0 border-b border-line px-5 pt-4 pb-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="t-status text-fg3">Check #{order.order_number}</p>
            <h1 className="t-page-title truncate text-fg">Table {order.table_name}</h1>
            <p className="t-support mt-0.5 truncate text-fg2">
              {order.guest_count} {order.guest_count === 1 ? 'guest' : 'guests'} · {order.server_name} · {elapsed(order.opened_at, now)}
            </p>
          </div>
          <OrderActions order={order} can={a} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusChip label={v.label} tone={v.tone} icon={v.icon} />
          {order.notes && <span className="t-support min-w-0 text-fg2">{order.notes}</span>}
        </div>
        {order.status === 'CANCELLED' && order.cancel_reason && <p className="t-meta mt-2 text-danger">{order.cancel_reason}</p>}
        {order.status === 'MERGED' && order.merged_into_id !== null && (
          <Button variant="secondary" size="sm" className="mt-3" icon={ArrowRight} onClick={() => navigate(`/orders/${order.merged_into_id}`)}>
            Open the check it joined
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <div className="flex flex-col gap-5">
          <StaleBanner error={staleError} />
          {cart && cartLines.length > 0 && <CartSection cart={cart} currency={currency} />}

          {order.items.length === 0 && cartLines.length === 0 && (
            <EmptyState
              icon={UtensilsCrossed}
              title="Nothing ordered yet"
              message={a.edit ? 'Add items from the menu, then send them to the kitchen.' : "Items will appear here as they're added."}
              className="py-10"
            />
          )}

          {sections.map((s) => (
            <section key={s.title} aria-label={s.title}>
              <h2 className="t-status text-fg3">
                {s.title} · <span className="tabular-nums">{s.quantity}</span>
              </h2>
              <ul className="divide-y divide-line">
                {s.items.map((item) =>
                  item.status === 'PENDING' ? (
                    <PendingItemRow
                      key={item.id}
                      item={item}
                      quantity={drafts.get(item.id) ?? item.quantity}
                      currency={currency}
                      editable={a.edit}
                      busy={itemBusy(item.id)}
                      onQuantity={(q) => onQuantity(item.id, q)}
                      onNote={() => setNoteFor(item)}
                      onRemove={() => remove.mutate(item)}
                    />
                  ) : (
                    <FiredItemRow
                      key={item.id}
                      item={item}
                      currency={currency}
                      canServe={a.serve && item.status === 'READY'}
                      canVoid={canVoidItem(item, a)}
                      serving={serve.isPending && serve.variables?.id === item.id}
                      onServe={() => serve.mutate(item)}
                      onVoid={() => {
                        setReason('')
                        setVoidFor(item)
                      }}
                    />
                  ),
                )}
              </ul>
            </section>
          ))}

          {live && <TotalsCard totals={order.totals} currency={currency} estimate={order.bill_id === null} className="bg-sunken/50 p-4" />}
        </div>
      </div>

      <Footer order={order} a={a} pending={pending} live={live} cartCount={cartLines.length} onFire={onFire} firing={firing} onBill={onBill} billing={billing} />

      <NoteDialog
        item={noteFor}
        busy={noteFor !== null && itemBusy(noteFor.id)}
        removing={remove.isPending}
        onClose={() => setNoteFor(null)}
        onSave={(item, note) => saveNote.mutate({ item, note })}
        onRemove={(item) => remove.mutate(item)}
      />
      <ConfirmDialog
        open={voidFor !== null}
        onOpenChange={(o) => !o && setVoidFor(null)}
        title={voidFor ? `Void ${voidFor.quantity}× ${voidFor.name}?` : ''}
        message="It comes off the check and the kitchen stops it if it isn't finished. This is recorded in the audit log."
        confirmLabel="Void item"
        destructive
        loading={voidItem.isPending}
        confirmDisabled={reason.trim().length < 3}
        onConfirm={() => voidFor && voidItem.mutate({ item: voidFor, reason: reason.trim() })}
      >
        <TextField label="Reason" placeholder="e.g. Guest changed mind" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} autoFocus />
      </ConfirmDialog>
    </aside>
  )
}

function Footer({ order, a, pending, live, cartCount: newLines, onFire, firing, onBill, billing }: {
  order: Order
  a: OrderAbilities
  pending: number
  live: boolean
  cartCount: number
  onFire: () => void
  firing: boolean
  onBill: () => void
  billing: boolean
}) {
  const navigate = useNavigate()
  let content: ReactNode = null
  if (order.status === 'OPEN') {
    if (pending > 0 && a.fire) {
      content = (
        <Button variant={newLines > 0 ? 'secondary' : 'accent'} size="lg" icon={Send} className="w-full" loading={firing} onClick={onFire} trailing={`· ${pending}`}>
          Send to kitchen
        </Button>
      )
    } else if (pending === 0 && live && a.bill && newLines === 0) {
      content = (
        <Button size="lg" icon={ReceiptText} className="w-full" loading={billing} onClick={onBill} trailing={`· ${money(order.totals.total, order.currency_code)}`}>
          Issue bill
        </Button>
      )
    }
  } else if (order.bill_id !== null && a.viewBill) {
    const billed = order.status === 'BILLED'
    content = (
      <Button variant={billed ? 'accent' : 'secondary'} size="lg" icon={ReceiptText} className="w-full" onClick={() => navigate(`/bills/${order.bill_id}`)}>
        {billed ? 'Take payment' : 'View bill'}
      </Button>
    )
  }
  if (!content) return null
  return <footer className="sticky bottom-16 z-10 shrink-0 rounded-b-[var(--radius-lg)] border-t border-line bg-surface px-5 py-4 md:bottom-0">{content}</footer>
}

function CartSection({ cart, currency }: { cart: CartControls; currency: string }) {
  const count = cartCount(cart.lines)
  const busy = cart.submitting !== null
  return (
    <section aria-labelledby="new-items-h" className="rounded-[var(--radius-lg)] border border-accent/40 bg-accent-soft/60 p-4">
      <div className="flex items-center gap-2">
        <h2 id="new-items-h" className="t-status flex-1 text-accent">New items · <span className="tabular-nums">{count}</span></h2>
        <Button variant="ghost" size="sm" onClick={cart.clear} disabled={busy} className="-mr-2 h-8 text-fg2">Clear</Button>
      </div>
      <ul className="mt-1 divide-y divide-line">
        {cart.lines.map((l) => {
          const key = lineKey(l.menuItemId, l.note)
          return (
            <li key={key} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="t-body-strong break-words text-fg">{l.name}</p>
                {l.note && <p className="t-support break-words text-accent italic">“{l.note}”</p>}
                <p className="t-amount-sm text-fg2">{money(lineTotal(l.price, l.quantity), currency)}</p>
              </div>
              <Stepper value={l.quantity} onChange={(q) => cart.setLine(key, q)} min={0} max={MAX_QTY} label={l.name} compact />
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="t-meta text-fg3">Taxes and service are added on the bill.</span>
        <span className="t-amount text-fg">{money(cartTotal(cart.lines), currency)}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="flex-1" loading={cart.submitting === 'add'} disabled={busy && cart.submitting !== 'add'} onClick={() => cart.submit(false)}>
          Add to check
        </Button>
        <Button variant="accent" icon={Send} className="flex-[1.4]" loading={cart.submitting === 'send'} disabled={busy && cart.submitting !== 'send'} onClick={() => cart.submit(true)}>
          Add & send
        </Button>
      </div>
    </section>
  )
}

function NoteDialog({ item, busy, removing, onClose, onSave, onRemove }: {
  item: OrderItem | null
  busy: boolean
  removing: boolean
  onClose: () => void
  onSave: (item: OrderItem, note: string) => void
  onRemove: (item: OrderItem) => void
}) {
  const [forId, setForId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  if (item && item.id !== forId) {
    setForId(item.id)
    setNote(item.notes ?? '')
  }
  return (
    <FormDialog
      open={item !== null}
      onOpenChange={(o) => {
        if (o) return
        setForId(null)
        onClose()
      }}
      title={item ? `Note for ${item.name}` : ''}
      description="The kitchen sees this on the ticket."
      submitLabel="Save note"
      loading={busy && !removing}
      submitDisabled={busy}
      onSubmit={() => item && onSave(item, note)}
      secondary={
        <Button variant="danger" loading={removing} disabled={busy && !removing} onClick={() => item && onRemove(item)}>
          Remove item
        </Button>
      }
    >
      <QuickNotes notes={QUICK_NOTES} onPick={(q) => setNote((n) => appendNote(n, q).slice(0, 200))} />
      <TextArea label="Note" value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)} />
    </FormDialog>
  )
}
