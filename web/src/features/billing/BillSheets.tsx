import { useState } from 'react'
import type { Bill, DiscountType } from '@/api/types'
import { compareMoney, money } from '@/lib/format'
import { acceptMoney, parseMoney } from '@/lib/money-input'
import { Button } from '@/ui/Button'
import { Segmented } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { ConfirmDialog, Drawer } from '@/ui/Overlay'
import { refundableByMethod, toCents, type Refundable } from './billMath'
import { currencySymbol } from './PaymentDrawer'

export const MIN_REASON = 3

const reasonOk = (reason: string) => reason.trim().length >= MIN_REASON

function ReasonField({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder: string; disabled?: boolean }) {
  const short = value.length > 0 && !reasonOk(value)
  return (
    <TextField
      label="Reason"
      value={value}
      maxLength={200}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      error={short ? `At least ${MIN_REASON} characters` : null}
      hint={short ? undefined : 'Required · recorded in the audit log'}
    />
  )
}

const plainValue = (v: string | null): string => (v ? v.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : '')

/** Apply, change or remove the bill discount (Android DiscountSheet). */
export function DiscountDrawer({ open, bill, busy, working, onClose, onApply, onRemove }: {
  open: boolean
  bill: Bill
  busy: boolean
  working: 'apply' | 'remove' | null
  onClose: () => void
  onApply: (type: DiscountType, value: string, reason: string) => void
  onRemove: () => void
}) {
  const existing = bill.discount_type === 'PERCENT' || bill.discount_type === 'FIXED' ? bill.discount_type : null
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? 'Edit discount' : 'Discount'}
      description={`Subtotal ${money(bill.subtotal, bill.currency_code)}. Service and tax are recalculated on the new amount.`}
      busy={busy}
      width={420}
    >
      <DiscountForm bill={bill} existing={existing} busy={busy} working={working} onApply={onApply} onRemove={onRemove} />
    </Drawer>
  )
}

function DiscountForm({ bill, existing, busy, working, onApply, onRemove }: {
  bill: Bill
  existing: DiscountType | null
  busy: boolean
  working: 'apply' | 'remove' | null
  onApply: (type: DiscountType, value: string, reason: string) => void
  onRemove: () => void
}) {
  const cur = bill.currency_code
  const [type, setType] = useState<DiscountType>(existing ?? 'PERCENT')
  const [valueText, setValueText] = useState(() => plainValue(bill.discount_value))
  const [reason, setReason] = useState(bill.discount_reason ?? '')
  const value = parseMoney(valueText)
  const valueError =
    valueText.trim() === '' ? null
    : value === null || toCents(value) <= 0n ? 'Enter a value above zero'
    : type === 'PERCENT' && compareMoney(value, '100') > 0 ? "A percentage can't exceed 100"
    : type === 'FIXED' && compareMoney(value, bill.subtotal) > 0 ? `More than the ${money(bill.subtotal, cur)} subtotal`
    : null
  const valid = value !== null && toCents(value) > 0n && valueError === null && reasonOk(reason)

  return (
    <form
      className="flex flex-col gap-5 pb-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && value !== null && !busy) onApply(type, value, reason.trim())
      }}
    >
      <Segmented
        ariaLabel="Discount type"
        options={['PERCENT', 'FIXED'] as const}
        value={type}
        onChange={(t) => {
          setType(t)
          setValueText('')
        }}
        label={(t) => (t === 'PERCENT' ? 'Percent' : 'Fixed amount')}
      />
      <TextField
        label={type === 'PERCENT' ? 'Percent off' : 'Amount off'}
        inputMode="decimal"
        autoComplete="off"
        prefix={type === 'FIXED' ? currencySymbol(cur) : undefined}
        value={valueText}
        disabled={busy}
        onChange={(e) => acceptMoney(e.target.value) && setValueText(e.target.value)}
        error={valueError}
        hint={type === 'PERCENT' ? 'Percent of the subtotal, e.g. 10' : undefined}
        className="t-amount-lg h-14"
      />
      <ReasonField value={reason} onChange={setReason} placeholder="e.g. Regular guest, manager comp" disabled={busy} />
      <div className="flex gap-3 pt-2">
        {existing && (
          <Button variant="danger" size="lg" className="flex-1" disabled={busy && working !== 'remove'} loading={working === 'remove'} onClick={onRemove}>
            Remove
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-[1.4]" disabled={!valid || (busy && working !== 'apply')} loading={working === 'apply'}>
          Apply discount
        </Button>
      </div>
    </form>
  )
}

/**
 * Give money back on the method it came in on, capped per method (Android RefundSheet). The
 * refund is decided against the bill as it was when the drawer opened or a method was
 * picked, and sends that version; it never quietly switches to another method.
 */
export function RefundDrawer({ open, bill, busy, onClose, onRefund }: {
  open: boolean
  bill: Bill
  busy: boolean
  onClose: () => void
  onRefund: (target: Refundable, amount: string, reason: string, version: number) => void
}) {
  const correction = bill.status === 'OPEN'
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={correction ? 'Correct a payment' : 'Refund'}
      description={correction ? 'Unwinds a payment taken by mistake so the bill can be fixed or voided.' : 'Money goes back on the method it was paid with.'}
      busy={busy}
      width={420}
    >
      <RefundForm bill={bill} busy={busy} onRefund={onRefund} />
    </Drawer>
  )
}

export function RefundForm({ bill, busy, onRefund }: {
  bill: Bill
  busy: boolean
  onRefund: (target: Refundable, amount: string, reason: string, version: number) => void
}) {
  const cur = bill.currency_code
  const options = refundableByMethod(bill)
  const [chosen, setChosen] = useState<{ methodId: number; methodName: string } | null>(() => options[0] ?? null)
  const [version, setVersion] = useState(bill.version)
  const [amountText, setAmountText] = useState(() => options[0]?.amount ?? '')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const correction = bill.status === 'OPEN'
  const target = chosen ? options.find((o) => o.methodId === chosen.methodId) : undefined

  // The chosen method has nothing left to give back (another device refunded it): never fall
  // back to a different method — clear the choice and say why.
  if (chosen && !target && !busy) {
    setChosen(null)
    setAmountText('')
    setConfirming(false)
    setNotice(`${chosen.methodName} has nothing left to refund — the bill changed. Check it and choose again.`)
  }

  const noticeLine = notice && (
    <p role="status" className="t-body-strong rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-fg">{notice}</p>
  )

  if (options.length === 0) {
    return (
      <div className="flex flex-col gap-3 pb-6">
        {noticeLine}
        <p className="t-body py-2 text-fg2">Nothing is held on this bill, so there's nothing to refund.</p>
      </div>
    )
  }

  const amount = parseMoney(amountText)
  const amountError =
    !target || amountText.trim() === '' ? null
    : amount === null || toCents(amount) <= 0n ? 'Enter an amount above zero'
    : compareMoney(amount, target.amount) > 0 ? `At most ${money(target.amount, cur)} can go back on ${target.methodName}`
    : null
  const valid = target !== undefined && amount !== null && toCents(amount) > 0n && amountError === null && reasonOk(reason)

  return (
    <form
      className="flex flex-col gap-5 pb-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) setConfirming(true)
      }}
    >
      {noticeLine}
      <div className="flex flex-col gap-1.5">
        <p id="refund-method-label" className="t-meta text-fg2">Paid with</p>
        <div role="radiogroup" aria-labelledby="refund-method-label" className="flex flex-wrap gap-2">
          {options.map((o) => {
            const selected = o.methodId === target?.methodId
            return (
              <button
                key={o.methodId}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() => {
                  // Choosing is deciding: pin the refund to the bill as it is now.
                  setChosen({ methodId: o.methodId, methodName: o.methodName })
                  setVersion(bill.version)
                  setAmountText(o.amount)
                  setNotice(null)
                }}
                className={
                  selected
                    ? 't-amount-sm h-11 rounded-full bg-ink px-4 font-semibold text-on-ink'
                    : 't-amount-sm h-11 rounded-full border border-line bg-surface px-4 font-semibold text-fg hover:bg-[var(--hover-overlay)]'
                }
              >
                {o.methodName} · {money(o.amount, cur)}
              </button>
            )
          })}
        </div>
      </div>
      <TextField
        label="Amount to refund"
        inputMode="decimal"
        autoComplete="off"
        prefix={currencySymbol(cur)}
        value={amountText}
        disabled={busy || !target}
        onChange={(e) => acceptMoney(e.target.value) && setAmountText(e.target.value)}
        error={amountError}
        hint={target ? `Up to ${money(target.amount, cur)} on ${target.methodName}` : 'Choose the method the money goes back on'}
        className="t-amount-lg h-14"
      />
      <ReasonField value={reason} onChange={setReason} placeholder={correction ? 'e.g. Charged the wrong card' : 'e.g. Dish returned'} disabled={busy} />
      <Button type="submit" variant="danger" size="lg" className="w-full" disabled={!valid || busy}>
        {valid && amount !== null ? `Refund ${money(amount, cur)}` : 'Refund'}
      </Button>

      <ConfirmDialog
        open={confirming && valid && amount !== null}
        onOpenChange={setConfirming}
        title={`Refund ${amount !== null ? money(amount, cur) : ''}?`}
        message={`${amount !== null ? money(amount, cur) : ''} goes back to the guest on ${target?.methodName ?? ''}. This can't be undone.`}
        confirmLabel="Refund"
        destructive
        loading={busy}
        onConfirm={() => {
          if (target && amount !== null && !busy) onRefund(target, amount, reason.trim(), version)
        }}
      />
    </form>
  )
}

/** Void an unpaid bill; the check opens again for changes. */
export function VoidDialog({ open, bill, busy, onClose, onVoid }: {
  open: boolean
  bill: Bill
  busy: boolean
  onClose: () => void
  onVoid: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose()
          setReason('')
        }
      }}
      title={`Void bill ${bill.bill_number}?`}
      message={`The bill is cancelled and check #${bill.order_number} opens again for changes. This is recorded in the audit log.`}
      confirmLabel="Void bill"
      destructive
      loading={busy}
      confirmDisabled={!reasonOk(reason)}
      onConfirm={() => onVoid(reason.trim())}
    >
      <ReasonField value={reason} onChange={setReason} placeholder="e.g. Wrong items billed" disabled={busy} />
    </ConfirmDialog>
  )
}
