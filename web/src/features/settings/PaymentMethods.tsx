import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Banknote, CreditCard, Plus } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { keys } from '@/api/queries'
import type { PaymentMethod, RestaurantSettings } from '@/api/types'
import { useAction } from '@/features/common/useAction'
import { applyServerErrors, DrawerActions, Notice, useDiscardConfirm } from '@/features/staff/manage-kit'
import { Button } from '@/ui/Button'
import { StatusChip } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { Switch, ToggleRow } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { Drawer } from '@/ui/Overlay'
import { useToast } from '@/ui/Toast'
import { createPaymentMethod, updatePaymentMethod, type PaymentMethodUpdate } from './api'

function sorted(methods: readonly PaymentMethod[]): PaymentMethod[] {
  return [...methods].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/**
 * Payment methods apply immediately (no version, no batch save), exactly like Android: each
 * switch is its own action, locked while in flight. The live list comes from the query, not
 * from the settings snapshot the general form is editing.
 */
export function PaymentMethodsSection({ methods, canEdit }: { methods: readonly PaymentMethod[]; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const toast = useToast()

  const replace = (updated: PaymentMethod) => {
    queryClient.setQueryData<RestaurantSettings>(keys.settings, (s) => {
      if (!s) return s
      const exists = s.payment_methods.some((m) => m.id === updated.id)
      return {
        ...s,
        payment_methods: exists ? s.payment_methods.map((m) => (m.id === updated.id ? updated : m)) : [...s.payment_methods, updated],
      }
    })
    void queryClient.invalidateQueries({ queryKey: keys.paymentMethods })
  }

  const update = useAction(
    ({ method, body }: { method: PaymentMethod; body: PaymentMethodUpdate }) => updatePaymentMethod(method.id, body),
    {
      invalidate: [keys.settings],
      success: null,
      onSuccess: replace,
    },
  )

  // Success copy depends on which switch changed, so it's passed per call.
  const change = (method: PaymentMethod, body: PaymentMethodUpdate, message: (m: PaymentMethod) => string) => {
    if (busyId !== null) return
    setBusyId(method.id)
    update.mutate({ method, body }, {
      onSuccess: (m) => toast.success(message(m)),
      onSettled: () => setBusyId(null),
    })
  }

  const nextSort = Math.min(1000, methods.reduce((max, m) => Math.max(max, m.sort_order), -1) + 1)

  return (
    <>
      {methods.length === 0 ? (
        <p className="t-support py-2 text-fg2">No payment methods yet. Add one so bills can be paid.</p>
      ) : (
        <ul className="-my-1 divide-y divide-line">
          {sorted(methods).map((method) => {
            const busy = busyId === method.id
            return (
              <li key={method.id} className="flex items-center gap-3 py-3">
                <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)]', method.is_active ? 'bg-sunken text-fg2' : 'bg-sunken text-fg-disabled')}>
                  {method.is_cash ? <Banknote aria-hidden className="size-5" /> : <CreditCard aria-hidden className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn('t-body-strong truncate', method.is_active ? 'text-fg' : 'text-fg2')}>{method.name}</div>
                  <div className="t-meta text-fg3">{method.is_active ? 'Offered at checkout' : 'Hidden at checkout'}</div>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    aria-pressed={method.is_cash}
                    disabled={busyId !== null}
                    onClick={() => change(method, { is_cash: !method.is_cash }, (m) => (m.is_cash ? `${m.name} takes cash and gives change` : `${m.name} is no longer cash`))}
                    title="Cash: cashiers enter the amount tendered and give change"
                    className={cn(
                      'h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-150 disabled:opacity-60',
                      method.is_cash ? 'bg-ink text-on-ink' : 'border border-line bg-surface text-fg2 hover:bg-[var(--hover-overlay)]',
                    )}
                  >
                    Cash
                  </button>
                ) : (
                  method.is_cash && <StatusChip label="Cash" tone="success" icon={Banknote} />
                )}
                <Switch
                  checked={method.is_active}
                  disabled={!canEdit || busyId !== null}
                  label={`${method.name} offered at checkout`}
                  onChange={(v) => change(method, { is_active: v }, (m) => (v ? `${m.name} can be used again` : `${m.name} hidden at checkout`))}
                />
                {busy && <span className="sr-only" role="status">Saving {method.name}</span>}
              </li>
            )
          })}
        </ul>
      )}
      {canEdit && (
        <div className="mt-3">
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAdding(true)}>Add payment method</Button>
        </div>
      )}
      <AddPaymentMethodDrawer open={adding} onClose={() => setAdding(false)} sortOrder={nextSort} onAdded={replace} />
    </>
  )
}

const addSchema = z.object({
  name: z.string().refine((v) => v.trim().length > 0, 'Name it, e.g. Card or UPI').refine((v) => v.trim().length <= 40, 'At most 40 characters'),
  is_cash: z.boolean(),
})
type AddValues = z.infer<typeof addSchema>

function AddPaymentMethodDrawer({ open, onClose, sortOrder, onAdded }: {
  open: boolean
  onClose: () => void
  sortOrder: number
  onAdded: (m: PaymentMethod) => void
}) {
  const form = useForm<AddValues>({ resolver: zodResolver(addSchema), defaultValues: { name: '', is_cash: false }, mode: 'onTouched' })
  const [general, setGeneral] = useState<string | null>(null)
  const create = useAction((v: AddValues) => createPaymentMethod({ name: v.name.trim(), is_cash: v.is_cash, is_active: true, sort_order: sortOrder }), {
    invalidate: [keys.settings],
    success: (m) => `${m.name} added`,
    toastError: false,
  })
  const dirty = form.formState.isDirty
  const discard = useDiscardConfirm(dirty)
  const close = () => {
    form.reset()
    setGeneral(null)
    onClose()
  }
  const submit = form.handleSubmit((v) => {
    setGeneral(null)
    create.mutate(v, {
      onSuccess: (m) => {
        onAdded(m)
        close()
      },
      onError: (e) => setGeneral(applyServerErrors(e, form.setError, ['name', 'is_cash'], { conflictField: 'name' })),
    })
  })
  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(o) => !o && discard.request(close)}
        title="Add payment method"
        description="Cashiers see it at checkout straight away."
        busy={create.isPending}
        width={440}
        footer={
          <DrawerActions
            secondary={<Button variant="secondary" disabled={create.isPending} onClick={() => discard.request(close)}>Cancel</Button>}
            primary={<Button type="submit" form="add-payment-method" loading={create.isPending}>Add</Button>}
          />
        }
      >
        <form
          id="add-payment-method"
          noValidate
          onSubmit={(e) => {
            // The drawer is portaled but React events still bubble to the settings form.
            e.stopPropagation()
            void submit(e)
          }} className="flex flex-col gap-4 pb-4">
          {general && <Notice tone="danger" live>{general}</Notice>}
          <TextField label="Name" maxLength={40} autoComplete="off" placeholder="e.g. Card, UPI, Voucher" error={form.formState.errors.name?.message} {...form.register('name')} />
          <Controller
            control={form.control}
            name="is_cash"
            render={({ field }) => (
              <ToggleRow title="Cash" subtitle="Cashiers enter the amount tendered and give change" checked={field.value} onChange={field.onChange} />
            )}
          />
        </form>
      </Drawer>
      {discard.dialog}
    </>
  )
}
