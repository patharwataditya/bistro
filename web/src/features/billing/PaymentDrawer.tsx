import { Banknote } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '@/api/errors'
import type { Bill, PaymentMethod } from '@/api/types'
import { compareMoney, money } from '@/lib/format'
import { acceptMoney, parseMoney } from '@/lib/money-input'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { TextField } from '@/ui/Field'
import { Drawer } from '@/ui/Overlay'
import { AmountLine } from '@/ui/Page'
import { ErrorState, Skeleton } from '@/ui/States'
import { quickTenders, subtractMoney, toCents } from './billMath'

/** The bill as our own charge settled it, and the change to hand back from our own tender. */
export interface Settled {
  bill: Bill
  change: string | null
}

export interface Charge {
  method: PaymentMethod
  amount: string
  tendered: string | null
  reference: string | null
}

/** The currency's own symbol for input prefixes ("₹", "$"), falling back to its code. */
export function currencySymbol(code: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

/** Plain decimal for an input's initial value ("1234.50"). */
const inputValue = (amount: string): string => amount.replace(/^-/, '')

export function sortMethods(methods: readonly PaymentMethod[]): PaymentMethod[] {
  return methods.filter((m) => m.is_active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/**
 * Take payment (Android PaymentSheet). Locked while a charge is in flight; switches to the
 * "Paid in full" state when this client's own charge settles the bill, with the change to
 * hand back.
 */
export function PaymentDrawer({ open, bill, settled, busy, methods, onClose, onCharge }: {
  open: boolean
  bill: Bill
  settled: Settled | null
  busy: boolean
  methods: UseQueryResult<PaymentMethod[], ApiError>
  onClose: () => void
  onCharge: (charge: Charge) => void
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={settled ? 'Bill settled' : 'Take payment'}
      description={settled ? undefined : `Bill ${bill.bill_number} · Table ${bill.table_name}`}
      busy={busy}
      width={480}
      footer={settled ? <Button size="lg" className="w-full" onClick={onClose} autoFocus>Done</Button> : undefined}
    >
      {settled ? <PaidInFull settled={settled} /> : <PaymentForm bill={bill} busy={busy} methods={methods} onCharge={onCharge} />}
    </Drawer>
  )
}

function PaymentForm({ bill, busy, methods, onCharge }: {
  bill: Bill
  busy: boolean
  methods: UseQueryResult<PaymentMethod[], ApiError>
  onCharge: (charge: Charge) => void
}) {
  const cur = bill.currency_code
  if (methods.isPending) {
    return (
      <div role="status" aria-label="Loading payment methods" className="flex gap-2 py-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-24 rounded-full" />)}
      </div>
    )
  }
  if (methods.isError && !methods.data) return <ErrorState error={methods.error} onRetry={() => void methods.refetch()} className="py-6" />
  const active = sortMethods(methods.data ?? [])
  if (active.length === 0) {
    return (
      <>
        <p className="t-body py-2 text-fg2">No payment methods are active. A manager can add one in Settings → Payment methods.</p>
        <AmountLine label="Balance due" amount={money(bill.balance_due, cur)} />
      </>
    )
  }
  return <PaymentFields bill={bill} methods={active} busy={busy} onCharge={onCharge} />
}

function PaymentFields({ bill, methods, busy, onCharge }: { bill: Bill; methods: PaymentMethod[]; busy: boolean; onCharge: (c: Charge) => void }) {
  const cur = bill.currency_code
  const symbol = currencySymbol(cur)
  const [methodId, setMethodId] = useState(() => methods[0]?.id ?? 0)
  const [amountText, setAmountText] = useState(() => inputValue(bill.balance_due))
  const [tenderedText, setTenderedText] = useState('')
  const [reference, setReference] = useState('')
  const method = methods.find((m) => m.id === methodId) ?? methods[0]

  const amount = parseMoney(amountText)
  const amountError =
    amountText.trim() === '' ? null
    : amount === null || toCents(amount) <= 0n ? 'Enter an amount above zero'
    : compareMoney(amount, bill.balance_due) > 0 ? `That's more than the ${money(bill.balance_due, cur)} due`
    : null
  const cash = method?.is_cash ?? false
  const tendered = cash ? parseMoney(tenderedText) : null
  const tenderedError = tendered !== null && amount !== null && compareMoney(tendered, amount) < 0 ? 'Less than the amount being paid' : null
  const valid = method !== undefined && amount !== null && toCents(amount) > 0n && amountError === null && tenderedError === null
  const remaining = amount !== null && amountError === null && compareMoney(amount, bill.balance_due) < 0 ? subtractMoney(bill.balance_due, amount) : null
  const change = cash && amount !== null && amountError === null && tendered !== null && tenderedError === null ? subtractMoney(tendered, amount) : null
  const tenders = cash && amount !== null && amountError === null ? quickTenders(amount) : []

  const submit = () => {
    if (!valid || !method || amount === null || busy) return
    const ref = reference.trim()
    onCharge({ method, amount, tendered: cash ? tendered : null, reference: !cash && ref ? ref : null })
  }

  return (
    <form
      className="flex flex-col gap-5 pb-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <fieldset disabled={busy} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <p id="pay-method-label" className="t-meta text-fg2">Payment method</p>
          <TenderChips
            labelledBy="pay-method-label"
            options={methods.map((m) => ({ key: String(m.id), label: m.name, selected: m.id === method?.id, onSelect: () => setMethodId(m.id) }))}
          />
        </div>

        <TextField
          label="Amount"
          inputMode="decimal"
          autoComplete="off"
          prefix={symbol}
          value={amountText}
          onChange={(e) => acceptMoney(e.target.value) && setAmountText(e.target.value)}
          error={amountError}
          hint={remaining ? `Split payment · ${money(remaining, cur)} will remain due` : undefined}
          className="t-amount-lg h-14"
        />

        {cash ? (
          <div className="flex flex-col gap-3">
            <TextField
              label="Cash tendered (optional)"
              inputMode="decimal"
              autoComplete="off"
              prefix={symbol}
              value={tenderedText}
              onChange={(e) => acceptMoney(e.target.value) && setTenderedText(e.target.value)}
              error={tenderedError}
              className="t-amount"
            />
            {tenders.length > 0 && (
              <TenderChips
                label="Quick amounts"
                options={tenders.map((t, i) => ({
                  key: t,
                  label: i === 0 ? 'Exact' : money(t, cur),
                  selected: tendered !== null && compareMoney(tendered, t) === 0,
                  onSelect: () => setTenderedText(t),
                }))}
              />
            )}
            <div aria-live="polite">
              {change !== null && (
                <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line bg-sunken px-4 py-3">
                  <span className="t-body-strong flex-1 text-fg2">Change due</span>
                  <span className="t-amount-lg text-fg">{money(change, cur)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <TextField
            label="Reference (optional)"
            placeholder="Card slip or UPI transaction id"
            maxLength={80}
            autoComplete="off"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        )}
      </fieldset>

      <div className="border-t border-line pt-3">
        <AmountLine label="Balance due" amount={money(bill.balance_due, cur)} />
      </div>

      <Button type="submit" variant="accent" size="lg" icon={Banknote} className="h-14 w-full" loading={busy} disabled={!valid}>
        {amount !== null && valid ? `Charge ${money(amount, cur)}` : 'Charge'}
      </Button>
    </form>
  )
}

/** Radio chips (method picker, quick tenders) with arrow-key movement. */
function TenderChips({ label, labelledBy, options }: {
  label?: string
  labelledBy?: string
  options: { key: string; label: string; selected: boolean; onSelect: () => void }[]
}) {
  const anySelected = options.some((o) => o.selected)
  return (
    <div role="radiogroup" aria-label={label} aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {options.map((o, i) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={o.selected}
          tabIndex={o.selected || (!anySelected && i === 0) ? 0 : -1}
          onClick={o.onSelect}
          onKeyDown={(e) => {
            const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
            if (!dir) return
            e.preventDefault()
            const next = options[(i + dir + options.length) % options.length]
            next?.onSelect()
            const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role=radio]')
            buttons?.[(i + dir + options.length) % options.length]?.focus()
          }}
          className={cn(
            't-amount-sm h-11 rounded-full px-4 font-semibold transition-[background-color,color,transform] duration-150 active:scale-95 disabled:opacity-50',
            o.selected ? 'bg-ink text-on-ink' : 'border border-line bg-surface text-fg hover:bg-[var(--hover-overlay)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** The settled moment: a check that draws itself, and the change to hand back if any. */
function PaidInFull({ settled: { bill, change } }: { settled: Settled }) {
  const cur = bill.currency_code
  return (
    <div role="status" className="flex flex-col items-center py-8 text-center">
      <motion.svg
        viewBox="0 0 96 96"
        className="size-24"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.36, ease: [0.05, 0.7, 0.1, 1] }}
        aria-hidden
      >
        <circle cx="48" cy="48" r="48" className="fill-success-soft" />
        <circle cx="48" cy="48" r="34.5" className="fill-success" />
        <motion.path
          d="M33.6 49 L44.2 59.5 L63.4 39.4"
          fill="none"
          strokeWidth="6.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-surface"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.14, duration: 0.36, ease: [0.05, 0.7, 0.1, 1] }}
        />
      </motion.svg>
      <h3 className="t-page-title mt-5 text-fg">Paid in full</h3>
      <p className="t-support mt-1 text-fg2">
        {money(bill.total, cur)} · Table {bill.table_name} is being released
      </p>
      {change && (
        <div className="mt-8">
          <div className="t-status text-fg3">Give change</div>
          <div className="t-amount-hero text-fg">{money(change, cur)}</div>
        </div>
      )}
    </div>
  )
}
