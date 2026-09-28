import { ArrowLeftRight, CircleX, EllipsisVertical, GitMerge, LayoutGrid, Loader2, Split, Square, SquareCheckBig, Users, type LucideIcon } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { DiningTable, Order } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { money } from '@/lib/format'
import { StatusChip } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { Stepper } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { ConfirmDialog, Drawer } from '@/ui/Overlay'
import { EmptyState, ErrorState, Skeleton } from '@/ui/States'
import { tableVisual } from '@/ui/status'
import { orderApi, usePickerFloor } from './api'
import { FormDialog } from './FormDialog'
import { pickCandidates, splitProblem, splittableItems, type OrderAbilities, type TablePick } from './orderModel'
import { useOrderMutation } from './useOrderMutation'

type Dialog = null | 'guests' | 'cancel' | TablePick

/** The "⋯" order actions (Android's "Check #n" sheet) and the flows they open. */
export function OrderActions({ order, can: a }: { order: Order; can: OrderAbilities }) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const any = a.changeGuests || a.move || a.merge || a.split || a.cancel
  if (!any) return null
  const close = () => setDialog(null)
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Order actions"
          title="Order actions"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-fg hover:bg-[var(--hover-overlay)] data-[state=open]:bg-[var(--hover-overlay)]"
        >
          <EllipsisVertical aria-hidden className="size-5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 w-[300px] rounded-[var(--radius-md)] border border-line bg-raised p-1.5 shadow-float"
          >
            <DropdownMenu.Label className="t-status px-3 pt-1.5 pb-2 text-fg3">Check #{order.order_number}</DropdownMenu.Label>
            {a.changeGuests && <MenuRow icon={Users} title="Change guests" subtitle={`${order.guest_count} now`} onSelect={() => setDialog('guests')} />}
            {a.move && <MenuRow icon={ArrowLeftRight} title="Move to another table" subtitle="Guests changed tables" onSelect={() => setDialog('move')} />}
            {a.merge && <MenuRow icon={GitMerge} title="Merge a table into this one" subtitle="Combine two checks" onSelect={() => setDialog('merge')} />}
            {a.split && <MenuRow icon={Split} title="Split items to a new table" subtitle="Part of the party moved" onSelect={() => setDialog('split')} />}
            {a.cancel && (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <MenuRow icon={CircleX} title="Cancel order" subtitle="Frees the table" danger onSelect={() => setDialog('cancel')} />
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <GuestsDialog order={order} open={dialog === 'guests'} onClose={close} />
      <CancelDialog order={order} open={dialog === 'cancel'} onClose={close} />
      <TablePicker order={order} pick={dialog === 'move' || dialog === 'merge' || dialog === 'split' ? dialog : null} onClose={close} />
    </>
  )
}

function MenuRow({ icon: Icon, title, subtitle, danger, onSelect }: { icon: LucideIcon; title: string; subtitle: string; danger?: boolean; onSelect: () => void }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 outline-none data-[highlighted]:bg-[var(--hover-overlay)]"
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]', danger ? 'bg-danger-soft text-danger' : 'bg-sunken text-fg')}>
        <Icon aria-hidden className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className={cn('t-body-strong block text-[14px]', danger ? 'text-danger' : 'text-fg')}>{title}</span>
        <span className="t-support block text-fg2">{subtitle}</span>
      </span>
    </DropdownMenu.Item>
  )
}

function GuestsDialog({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const [guests, setGuests] = useState(order.guest_count)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setGuests(order.guest_count)
  }
  const save = useOrderMutation(order.id, (g: number) => orderApi.update(order.id, order.version, g), { onSuccess: onClose })
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Guests at ${order.table_name}`}
      submitLabel="Save"
      loading={save.isPending}
      submitDisabled={guests === order.guest_count}
      onSubmit={() => save.mutate(guests)}
    >
      <div className="flex items-center gap-3">
        <span className="t-body-strong flex-1 text-fg">Guests</span>
        <Stepper value={guests} onChange={setGuests} min={1} max={100} label="Guests" />
      </div>
    </FormDialog>
  )
}

function CancelDialog({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { can } = useMe()
  const [reason, setReason] = useState('')
  const cancel = useOrderMutation(order.id, (r: string) => orderApi.cancel(order.id, order.version, r), {
    success: 'Order cancelled',
    onSuccess: () => {
      onClose()
      navigate(can(P.TABLES_VIEW) ? '/floor' : '/orders')
    },
  })
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason('')
          onClose()
        }
      }}
      title={`Cancel check #${order.order_number}?`}
      message="Every item is voided, open kitchen tickets are stopped and the table is released."
      confirmLabel="Cancel order"
      destructive
      loading={cancel.isPending}
      confirmDisabled={reason.trim().length < 3}
      onConfirm={() => cancel.mutate(reason.trim())}
    >
      <TextField label="Reason" placeholder="e.g. Guests left" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} autoFocus />
    </ConfirmDialog>
  )
}

const PICK_TITLE: Record<TablePick, string> = {
  move: 'Move to which table?',
  merge: "Which table's check should join this one?",
  split: 'Split items to a new table',
}

function TablePicker({ order, pick, onClose }: { order: Order; pick: TablePick | null; onClose: () => void }) {
  const navigate = useNavigate()
  const floor = usePickerFloor(pick !== null)
  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set())
  const [guests, setGuests] = useState(1)
  const [confirm, setConfirm] = useState<DiningTable | null>(null)
  const [openedFor, setOpenedFor] = useState<TablePick | null>(null)
  if (pick !== openedFor) {
    setOpenedFor(pick)
    if (pick === 'split') {
      setSelection(new Set())
      setGuests(1)
    }
  }

  const refetchFloor = () => void floor.refetch()
  const move = useOrderMutation(order.id, (t: DiningTable) => orderApi.transfer(order.id, order.version, t.id), {
    success: (_, t) => `Moved to ${t.name}`,
    onSuccess: () => {
      setConfirm(null)
      onClose()
    },
    onError: refetchFloor,
  })
  const merge = useOrderMutation(order.id, (t: DiningTable) => {
    const src = t.active_order
    if (!src) return Promise.reject(new Error('That table has no open check.'))
    return orderApi.merge(order.id, order.version, src.id, src.version)
  }, {
    success: (_, t) => `${t.name} merged into this order`,
    onSuccess: () => {
      setConfirm(null)
      onClose()
    },
    onError: refetchFloor,
  })
  const split = useOrderMutation(order.id, (t: DiningTable) => orderApi.split(order.id, order.version, t.id, [...selection], guests), {
    success: (_, t) => `Split to ${t.name}`,
    onSuccess: (created) => {
      onClose()
      navigate(`/orders/${created.id}`)
    },
    onError: refetchFloor,
  })
  const busy = move.isPending || merge.isPending || split.isPending

  const splittable = splittableItems(order.items)
  const problem = splitProblem(selection, order.items)
  const candidates = floor.data && pick ? pickCandidates(floor.data.tables, order, pick) : []
  const tilesEnabled = pick !== 'split' || problem === null

  const onPick = (t: DiningTable) => {
    if (pick === 'split') split.mutate(t)
    else setConfirm(t)
  }

  const subtitle = pick === 'move'
    ? `Free tables only. ${order.table_name} will be released.`
    : pick === 'merge'
      ? 'Its items and guests join this check; that table is released.'
      : 'Choose the items, then a free table for them.'

  return (
    <>
      <Drawer open={pick !== null} onOpenChange={(o) => !o && onClose()} title={pick ? PICK_TITLE[pick] : ''} description={subtitle} busy={busy} width={460}>
        <div className="flex flex-col gap-5 pb-6">
          {pick === 'split' && (
            splittable.length === 0 ? (
              <p className="t-support text-fg2">Nothing can be split yet: items still with the kitchen stay on this check until they're served.</p>
            ) : (
              <>
                <fieldset className="flex flex-col">
                  <legend className="t-status mb-2 text-fg3">Items</legend>
                  {splittable.map((item) => {
                    const checked = selection.has(item.id)
                    return (
                      <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-1 py-1.5 hover:bg-[var(--hover-overlay)] has-[:focus-visible]:shadow-[0_0_0_2px_var(--accent)]">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(selection)
                            if (checked) next.delete(item.id)
                            else next.add(item.id)
                            setSelection(next)
                          }}
                        />
                        {checked ? <SquareCheckBig aria-hidden className="size-5 shrink-0 text-accent" /> : <Square aria-hidden className="size-5 shrink-0 text-fg3" />}
                        <span className="t-body min-w-0 flex-1 text-fg">
                          {item.quantity}× {item.name}
                          {item.status === 'PENDING' && <span className="t-meta ml-1.5 text-warning">Not sent</span>}
                        </span>
                        <span className="t-amount-sm text-fg2">{money(item.line_total, order.currency_code)}</span>
                      </label>
                    )
                  })}
                </fieldset>
                {problem === 'everything' && <p role="status" className="t-meta text-warning">That's every item — move the whole order instead.</p>}
                <div className="flex items-center gap-3">
                  <span className="t-body-strong flex-1 text-fg">Guests moving</span>
                  <Stepper value={guests} onChange={setGuests} min={1} max={100} label="Guests moving" compact />
                </div>
              </>
            )
          )}
          {(pick !== 'split' || splittable.length > 0) && (
            <div className="flex flex-col gap-2">
              {pick === 'split' && <h3 className="t-status text-fg3">Table</h3>}
              {floor.isPending ? (
                <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[92px]" />)}</div>
              ) : !floor.data ? (
                <ErrorState error={floor.error ?? new Error('Couldn’t load the tables.')} onRetry={refetchFloor} />
              ) : candidates.length === 0 ? (
                <EmptyState
                  icon={LayoutGrid}
                  title="No suitable tables"
                  message={pick === 'merge' ? 'No other table has an open check to merge.' : 'Every table is taken or unavailable right now.'}
                  className="py-8"
                />
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {candidates.map((t) => (
                      <PickTile key={t.id} table={t} currency={order.currency_code} enabled={tilesEnabled && !busy} loading={split.isPending && split.variables?.id === t.id} onPick={() => onPick(t)} />
                    ))}
                  </div>
                  {pick === 'split' && problem === 'none-selected' && <p className="t-meta text-fg3">Select at least one item first.</p>}
                </>
              )}
            </div>
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? (pick === 'merge' ? `Merge ${confirm.name} into this check?` : `Move to ${confirm.name}?`) : ''}
        message={confirm ? confirmMessage(order, confirm, pick) : ''}
        confirmLabel={pick === 'merge' ? 'Merge' : 'Move'}
        loading={busy}
        onConfirm={() => {
          if (!confirm) return
          if (pick === 'merge') merge.mutate(confirm)
          else move.mutate(confirm)
        }}
      />
    </>
  )
}

function confirmMessage(order: Order, table: DiningTable, pick: TablePick | null): string {
  if (pick === 'merge') {
    const src = table.active_order
    const amount = src ? money(src.subtotal, order.currency_code) : ''
    return `Check #${src?.order_number ?? ''} (${amount}) joins #${order.order_number}. ${table.name} is released. This can't be undone.`
  }
  return `Check #${order.order_number} moves from ${order.table_name} to ${table.name}; ${order.table_name} is released.`
}

function PickTile({ table, currency, enabled, loading, onPick }: { table: DiningTable; currency: string; enabled: boolean; loading: boolean; onPick: () => void }) {
  const v = tableVisual(table.status)
  const src = table.active_order
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!enabled}
      aria-busy={loading || undefined}
      aria-label={src ? `Table ${table.name}, check ${src.order_number}, ${src.guest_count} guests, ${money(src.subtotal, currency)}` : `Table ${table.name}, ${table.capacity} seats, ${v.label}`}
      className={cn(
        'relative flex min-h-[92px] flex-col items-start gap-1 rounded-[var(--radius-lg)] border p-3 text-left transition-[border-color,transform,background-color] duration-150',
        enabled ? 'border-line-strong bg-surface hover:bg-[var(--hover-overlay)] active:scale-[0.98]' : 'border-line bg-surface opacity-60',
      )}
    >
      <span className={cn('t-table-label', enabled ? 'text-fg' : 'text-fg-disabled')}>{table.name}</span>
      <span className="t-meta text-fg2">{table.capacity} seats</span>
      {src ? (
        <span className="t-meta text-fg2">#{src.order_number} · {src.guest_count} · {money(src.subtotal, currency)}</span>
      ) : (
        <StatusChip label={v.label} tone={v.tone} icon={v.icon} />
      )}
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-lg)] bg-surface/80">
          <Loader2 aria-hidden className="size-5 animate-spin text-fg" />
        </span>
      )}
    </button>
  )
}
