import { Banknote, Tag, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Bill, PaymentRecord } from '@/api/types'
import { dateTime, money, percent, time } from '@/lib/format'
import { Card } from '@/ui/Card'
import { StatusChip } from '@/ui/Chip'
import { cn } from '@/ui/cn'
import { Section } from '@/ui/Page'
import { billVisual } from '@/ui/status'
import { hasRefunds, netPaid, paidFraction, toCents } from './billMath'

/** The number that matters most for this bill's state, as large as the layout allows. */
export function BillHero({ bill, zone, actions }: { bill: Bill; zone: string; actions?: ReactNode }) {
  const cur = bill.currency_code
  const v = billVisual(bill.status)
  const [label, amount] =
    bill.status === 'OPEN' ? ['Balance due', bill.balance_due]
    : bill.status === 'VOID' ? ['Void', bill.total]
    : bill.status === 'REFUNDED' ? ['Refunded', bill.refunded_total]
    : ['Paid', bill.total]
  const net = netPaid(bill)
  const refunded = hasRefunds(bill)
  const fraction = paidFraction(bill)

  return (
    <Card className="@container p-5 md:p-6">
      <div className="flex flex-col gap-6 @min-[580px]:flex-row @min-[580px]:items-end">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 className="t-status text-fg3">{label}</h2>
            <StatusChip label={v.label} tone={v.tone} icon={v.icon} />
          </div>
          <p className={cn('t-amount-hero mt-1 break-words', bill.status === 'VOID' ? 'text-fg3 line-through' : 'text-fg')}>
            {money(amount, cur)}
          </p>
          <div className="t-amount-sm mt-1 flex flex-col gap-0.5 text-fg2">
            {bill.status === 'OPEN' ? (
              <span>
                Total {money(bill.total, cur)} · {refunded ? 'Net paid after refunds' : 'Paid'} {money(net, cur)}
              </span>
            ) : bill.status === 'VOID' ? (
              <>
                {bill.voided_at && <span>Voided {dateTime(bill.voided_at, zone)}</span>}
                {bill.void_reason && <span className="t-support text-fg2 italic">“{bill.void_reason}”</span>}
              </>
            ) : (
              <>
                {bill.paid_at && <span>Settled {dateTime(bill.paid_at, zone)}</span>}
                {refunded && (
                  <span>
                    Total {money(bill.total, cur)} · Refunded {money(bill.refunded_total, cur)} · Net paid after refunds {money(net, cur)}
                  </span>
                )}
              </>
            )}
          </div>
          {bill.status === 'OPEN' && toCents(bill.total) > 0n && (
            <div className="mt-4">
              <div
                role="progressbar"
                aria-label="Paid so far"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(fraction * 100)}
                aria-valuetext={`${money(net, cur)} of ${money(bill.total, cur)} paid`}
                className="h-1.5 overflow-hidden rounded-full bg-sunken"
              >
                <div className="h-full origin-left rounded-full bg-success transition-transform duration-[240ms] ease-[var(--ease-standard)]"
                  style={{ transform: `scaleX(${fraction})` }} />
              </div>
            </div>
          )}
        </div>
        {actions && <div className="flex w-full flex-col gap-2 @min-[580px]:w-[280px] @min-[580px]:shrink-0">{actions}</div>}
      </div>
    </Card>
  )
}

/** How the discount was set and why: the totals card shows only its amount. */
export function DiscountDetail({ bill }: { bill: Bill }) {
  if (!bill.discount_type || toCents(bill.discount_amount) <= 0n) return null
  const cur = bill.currency_code
  const value = bill.discount_value
  const how = value === null ? 'Discount' : bill.discount_type === 'PERCENT' ? `${percent(value)} off` : `${money(value, cur)} off`
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-success-soft p-3">
      <Tag aria-hidden className="size-5 shrink-0 text-success" />
      <div className="min-w-0 flex-1">
        <div className="t-body-strong text-fg">{how}</div>
        {bill.discount_reason && <div className="t-support text-fg2 italic">“{bill.discount_reason}”</div>}
      </div>
      <span className="t-amount text-success">−{money(bill.discount_amount, cur)}</span>
    </div>
  )
}

export function PaymentsSection({ bill, zone }: { bill: Bill; zone: string }) {
  const cur = bill.currency_code
  const subtitle = bill.payments.length === 0
    ? undefined
    : `${money(bill.paid_total, cur)} taken${hasRefunds(bill) ? ` · ${money(bill.refunded_total, cur)} returned` : ''}`
  return (
    <Section title="Payments" subtitle={subtitle}>
      <Card flat className="px-4 py-2">
        {bill.payments.length === 0 ? (
          <p className="t-support py-2 text-fg2">
            {bill.status === 'OPEN'
              ? 'No payments yet. Take a payment to settle the bill — split tender is fine.'
              : bill.status === 'VOID'
                ? 'No money was taken on this bill.'
                : 'Settled without a payment (nothing was due).'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {bill.payments.map((p) => <PaymentRow key={p.id} payment={p} currency={cur} zone={zone} />)}
          </ul>
        )}
      </Card>
    </Section>
  )
}

function PaymentRow({ payment: p, currency, zone }: { payment: PaymentRecord; currency: string; zone: string }) {
  const refund = p.kind === 'REFUND'
  const kindLabel = refund ? (p.is_correction ? 'Correction' : 'Refund') : null
  const Icon = refund ? Undo2 : Banknote
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]', refund ? 'bg-danger-soft text-danger' : 'bg-sunken text-fg2')}>
        <Icon aria-hidden className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-body-strong text-fg">{p.method_name}</span>
          {kindLabel && <span className="t-status rounded-[var(--radius-xs)] bg-danger-soft px-1.5 py-0.5 text-danger">{kindLabel}</span>}
        </div>
        <div className="t-meta text-fg3">{p.created_by_name.trim() || 'Staff'} · {time(p.created_at, zone)}</div>
        {p.tendered !== null && (
          <div className="t-amount-sm text-fg2">Tendered {money(p.tendered, currency)} · Change {money(p.change_due, currency)}</div>
        )}
        {p.reference && <div className="t-identifier text-fg2">Ref {p.reference}</div>}
        {p.reason && <div className="t-support text-fg2 italic">“{p.reason}”</div>}
      </div>
      <span className={cn('t-amount shrink-0', refund ? 'text-danger' : 'text-fg')}>
        {refund ? '−' : ''}{money(p.amount, currency)}
      </span>
    </li>
  )
}
