import { hashKey, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { Ban, Banknote, Check, ChevronLeft, ReceiptText, Tag, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import type { ApiError } from '@/api/errors'
import { keys, useBill, usePaymentMethods } from '@/api/queries'
import type { Bill, Totals } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { TotalsCard } from '@/features/common/Totals'
import { useAction } from '@/features/common/useAction'
import { IntentKey } from '@/lib/idempotency'
import { money } from '@/lib/format'
import { Button } from '@/ui/Button'
import { ErrorState, Skeleton, StaleBanner } from '@/ui/States'
import { useToast } from '@/ui/Toast'
import * as api from './api'
import { billActions, type Refundable } from './billMath'
import { payFingerprint, refundFingerprint, refused } from './intents'
import { DiscountDetail, BillHero, PaymentsSection } from './BillParts'
import { DiscountDrawer, RefundDrawer, VoidDialog } from './BillSheets'
import { PaymentDrawer, type Charge } from './PaymentDrawer'

type Sheet = 'pay' | 'discount' | 'refund' | 'void'

/** Money intents that were sent but not definitively answered, pinned to the bill version they were decided on. */
interface Pending {
  version: number
}

function toTotals(bill: Bill): Totals {
  return {
    subtotal: bill.subtotal,
    discount_amount: bill.discount_amount,
    service_charge_percent: bill.service_charge_percent,
    service_charge_amount: bill.service_charge_amount,
    taxes: bill.taxes,
    tax_total: bill.tax_total,
    round_off: bill.round_off,
    total: bill.total,
  }
}

export function BillDetail({ billId }: { billId: number }) {
  const { me, can } = useMe()
  const queryClient = useQueryClient()
  const cached = queryClient.getQueryData<Bill>(keys.bill(billId))
  // Live while money can still move; a settled bill only needs an occasional check.
  const query = useBill(billId, !cached || cached.status === 'OPEN')
  const bill = query.data
  const canPay = can(P.BILLING_PROCESS_PAYMENT)
  const methods = usePaymentMethods(canPay)
  const zone = me.location.timezone
  const location = useLocation()
  const listSearch = location.search

  if (query.isPending) return <DetailSkeleton />
  if (!bill) {
    return (
      <>
        <BackLink search={listSearch} />
        <ErrorState error={query.error ?? new Error("Couldn't load this")} onRetry={() => void query.refetch()} />
      </>
    )
  }
  return <BillView bill={bill} zone={zone} staleError={query.isError ? query.error : null} methods={methods} listSearch={listSearch} />
}

function BillView({ bill, zone, staleError, methods, listSearch }: {
  bill: Bill
  zone: string
  staleError: ApiError | null
  methods: ReturnType<typeof usePaymentMethods>
  listSearch: string
}) {
  const { can } = useMe()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [settled, setSettled] = useState<Bill | null>(null)
  const payKey = useRef(new IntentKey())
  const refundKey = useRef(new IntentKey())
  const payPending = useRef<Pending | null>(null)
  const refundPending = useRef<Pending | null>(null)
  const cur = bill.currency_code
  const billId = bill.id

  const invalidate: QueryKey[] = [keys.bill(bill.id), ['bills'], keys.floor, keys.dashboard, keys.order(bill.order_id), ['orders']]
  const apply = async (updated: Bill) => {
    // Drop a poll that started before this answer, so it can't put the old bill back.
    await queryClient.cancelQueries({ queryKey: keys.bill(updated.id), exact: true })
    queryClient.setQueryData(keys.bill(updated.id), updated)
  }

  const payAction = useAction((v: { key: string; charge: Charge; version: number }) =>
    api.pay(bill.id, v.key, {
      version: v.version,
      payment_method_id: v.charge.method.id,
      amount: v.charge.amount,
      tendered: v.charge.tendered,
      reference: v.charge.reference,
    }), { invalidate })
  const refundAction = useAction((v: { key: string; target: Refundable; amount: string; reason: string; version: number }) =>
    api.refund(bill.id, v.key, { version: v.version, payment_method_id: v.target.methodId, amount: v.amount, reason: v.reason }), { invalidate })
  const settleAction = useAction(() => api.settle(bill), { invalidate, success: 'Bill closed', onSuccess: (b) => void apply(b) })
  const discountAction = useAction((v: { type: Bill['discount_type']; value: string; reason: string }) =>
    v.type === 'PERCENT' || v.type === 'FIXED' ? api.setDiscount(bill, v.type, v.value, v.reason) : api.removeDiscount(bill), { invalidate })
  const voidAction = useAction((reason: string) => api.voidBill(bill, reason), { invalidate })

  const working = payAction.isPending || refundAction.isPending || settleAction.isPending || discountAction.isPending || voidAction.isPending

  /*
   * A pending money intent is only safe to replay while the bill is exactly as it was. Once
   * the bill has moved on (say because the "lost" payment actually landed), a new charge of
   * the same amount is a new payment and gets a new key. If the payment drawer is still open
   * over an unsettled intent, close it rather than leave the old amount armed for a second
   * tap; if the bill is now paid, show the settled state instead (Android BillViewModel).
   */
  const sheetRef = useRef(sheet)
  const settledRef = useRef(settled)
  useEffect(() => {
    sheetRef.current = sheet
    settledRef.current = settled
  })
  useEffect(() => {
    const hash = hashKey(keys.bill(billId))
    // Every fresh copy of this bill (poll, refetch or an action's answer) comes through the cache.
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success' || event.query.queryHash !== hash) return
      const fresh = event.query.state.data as Bill | undefined
      if (!fresh) return
      if (payPending.current && payPending.current.version !== fresh.version) {
        payPending.current = null
        payKey.current.reset()
        if (sheetRef.current === 'pay' && !settledRef.current && fresh.status === 'OPEN') {
          setSheet(null)
          toast.info('A payment was recorded. Check the balance before charging again.')
        }
      }
      if (refundPending.current && refundPending.current.version !== fresh.version) {
        refundPending.current = null
        refundKey.current.reset()
      }
      if (sheetRef.current === 'pay' && !settledRef.current && fresh.status !== 'OPEN') {
        payPending.current = null
        setSettled(fresh)
      }
    })
  }, [queryClient, billId, toast])

  const charge = (c: Charge) => {
    const fingerprint = payFingerprint(bill, { methodId: c.method.id, amount: c.amount, tendered: c.tendered, reference: c.reference })
    const key = payKey.current.keyFor(fingerprint)
    payPending.current = { version: bill.version }
    payAction.mutate({ key, charge: c, version: bill.version }, {
      onSuccess: (updated) => {
        payPending.current = null
        payKey.current.reset()
        void apply(updated)
        if (updated.status === 'PAID') {
          // The drawer's own "Paid in full" state (a polite live region) says it; no toast on top.
          setSettled(updated)
        } else {
          setSheet(null)
          toast.success(`${money(c.amount, updated.currency_code)} received · ${money(updated.balance_due, updated.currency_code)} still due`)
        }
      },
      onError: (err) => {
        if (refused(err)) {
          payPending.current = null
          payKey.current.reset()
        }
      },
    })
  }

  const doRefund = (target: Refundable, amount: string, reason: string) => {
    const key = refundKey.current.keyFor(refundFingerprint(bill, target.methodId, amount, reason))
    refundPending.current = { version: bill.version }
    refundAction.mutate({ key, target, amount, reason, version: bill.version }, {
      onSuccess: (updated) => {
        refundPending.current = null
        refundKey.current.reset()
        void apply(updated)
        setSheet(null)
        toast.success(`Refunded ${money(amount, updated.currency_code)} to ${target.methodName}`)
      },
      onError: (err) => {
        if (refused(err)) {
          refundPending.current = null
          refundKey.current.reset()
        }
      },
    })
  }

  const closeSheet = () => {
    if (working) return
    setSheet(null)
    setSettled(null)
  }

  const actions = billActions(bill, {
    pay: can(P.BILLING_PROCESS_PAYMENT),
    discount: can(P.BILLING_DISCOUNT),
    refund: can(P.BILLING_REFUND),
    void: can(P.BILLING_VOID),
  })
  const refundPrimary = actions.refund && bill.status !== 'OPEN'
  const hasDiscount = bill.discount_type === 'PERCENT' || bill.discount_type === 'FIXED'

  const heroActions = (actions.takePayment || actions.settleZero || actions.discount || actions.refund) ? (
    <>
      {actions.takePayment && (
        <Button variant="accent" size="lg" icon={Banknote} className="h-14 w-full" disabled={working} onClick={() => setSheet('pay')}
          trailing={`· ${money(bill.balance_due, cur)}`}>
          Take payment
        </Button>
      )}
      {actions.settleZero && (
        <Button size="lg" icon={Check} className="h-14 w-full" loading={settleAction.isPending} disabled={working && !settleAction.isPending}
          onClick={() => settleAction.mutate(undefined)} trailing="· nothing to collect">
          Close bill
        </Button>
      )}
      {(actions.discount || (actions.refund && !refundPrimary)) && (
        <div className="flex gap-2">
          {actions.discount && (
            <Button variant="secondary" icon={Tag} className="flex-1" disabled={working} onClick={() => setSheet('discount')}>
              {hasDiscount ? 'Edit discount' : 'Discount'}
            </Button>
          )}
          {actions.refund && !refundPrimary && (
            <Button variant="secondary" icon={Undo2} className="flex-1" disabled={working} onClick={() => setSheet('refund')}>
              Refund
            </Button>
          )}
        </div>
      )}
      {refundPrimary && (
        <Button variant="secondary" size="lg" icon={Undo2} className="w-full" disabled={working} onClick={() => setSheet('refund')}>
          Refund
        </Button>
      )}
    </>
  ) : null

  return (
    <div className="@container flex flex-col gap-5 pb-10">
      <BackLink search={listSearch} />
      <header className="flex flex-col gap-3 @min-[620px]:flex-row @min-[620px]:items-end">
        <div className="min-w-0 flex-1">
          <p className="t-status text-fg3">Table {bill.table_name} · Check #{bill.order_number}</p>
          <h1 className="t-page-title text-fg">Bill {bill.bill_number}</h1>
          <p className="t-support mt-0.5 text-fg2">
            {bill.server_name} · {bill.guest_count} {bill.guest_count === 1 ? 'guest' : 'guests'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(P.ORDERS_VIEW) && (
            <Link
              to={`/orders/${bill.order_id}`}
              className="t-button inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-surface px-[18px] text-fg transition-colors hover:bg-[var(--hover-overlay)]"
            >
              <ReceiptText aria-hidden className="size-[18px]" />
              Open check #{bill.order_number}
            </Link>
          )}
          {actions.void && (
            <Button variant="danger" icon={Ban} disabled={working} onClick={() => setSheet('void')}>
              Void bill
            </Button>
          )}
        </div>
      </header>
      <StaleBanner error={staleError} />
      <BillHero bill={bill} zone={zone} actions={heroActions} />
      <section aria-label="Breakdown" className="flex flex-col gap-2">
        <TotalsCard totals={toTotals(bill)} currency={cur} estimate={false} />
        <DiscountDetail bill={bill} />
      </section>
      <PaymentsSection bill={bill} zone={zone} />

      <PaymentDrawer
        open={sheet === 'pay'}
        bill={bill}
        settled={settled}
        busy={payAction.isPending}
        methods={methods}
        onClose={closeSheet}
        onCharge={charge}
      />
      <DiscountDrawer
        open={sheet === 'discount'}
        bill={bill}
        busy={discountAction.isPending}
        working={discountAction.isPending ? (discountAction.variables?.type ? 'apply' : 'remove') : null}
        onClose={closeSheet}
        onApply={(type, value, reason) =>
          discountAction.mutate({ type, value, reason }, {
            onSuccess: (updated) => {
              void apply(updated)
              setSheet(null)
              toast.success(`Discount applied · new total ${money(updated.total, updated.currency_code)}`)
            },
          })}
        onRemove={() =>
          discountAction.mutate({ type: null, value: '', reason: '' }, {
            onSuccess: (updated) => {
              void apply(updated)
              setSheet(null)
              toast.success('Discount removed')
            },
          })}
      />
      <RefundDrawer open={sheet === 'refund'} bill={bill} busy={refundAction.isPending} onClose={closeSheet} onRefund={doRefund} />
      <VoidDialog
        open={sheet === 'void'}
        bill={bill}
        busy={voidAction.isPending}
        onClose={closeSheet}
        onVoid={(reason) =>
          voidAction.mutate(reason, {
            onSuccess: (updated) => {
              void apply(updated)
              setSheet(null)
              toast.success(`Bill ${updated.bill_number} voided · the check is open again`)
            },
          })}
      />
    </div>
  )
}

function BackLink({ search }: { search: string }) {
  return (
    <Link to={{ pathname: '/bills', search }} className="t-body-strong -ml-1 inline-flex h-10 w-fit items-center gap-1 rounded-[var(--radius-sm)] pr-2 text-fg2 hover:text-fg lg:hidden">
      <ChevronLeft aria-hidden className="size-5" />
      Bills
    </Link>
  )
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading bill" className="flex flex-col gap-4 pt-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  )
}
