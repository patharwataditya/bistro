import { hashKey, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { Ban, Banknote, Check, ChevronLeft, ReceiptText, Tag, Undo2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { billActions, subtractMoney, toCents, type Refundable } from './billMath'
import { billChangedMessage, payFingerprint, refundFingerprint, refused } from './intents'
import { DiscountDetail, BillHero, PaymentsSection } from './BillParts'
import { DiscountDrawer, RefundDrawer, VoidDialog } from './BillSheets'
import { PaymentDrawer, type Charge, type Settled } from './PaymentDrawer'

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
  const [sheet, setSheetState] = useState<Sheet | null>(null)
  const [settled, setSettledState] = useState<Settled | null>(null)
  // The bill version the person was looking at when they opened a sheet: every money call
  // from that sheet is decided against it, so a bill that moved meanwhile is refused as stale
  // rather than acted on blind (Android MoneyIntent.version).
  const [sheetVersion, setSheetVersionState] = useState(bill.version)
  const payKey = useRef(new IntentKey())
  const refundKey = useRef(new IntentKey())
  const payPending = useRef<Pending | null>(null)
  const refundPending = useRef<Pending | null>(null)
  /** A charge request is on the wire; the drawer stays put until it's answered. */
  const payInFlight = useRef(false)
  /** Our unanswered charge was pinned to a version the bill has since left — it may have landed. */
  const ownPaymentMayHaveLanded = useRef(false)
  // Mirrors of the state above for the cache listener, updated in the same breath as the state.
  const sheetRef = useRef(sheet)
  const settledRef = useRef(settled)
  const sheetVersionRef = useRef(sheetVersion)
  const cur = bill.currency_code
  const billId = bill.id

  const setSheet = (next: Sheet | null) => {
    sheetRef.current = next
    setSheetState(next)
  }
  const setSettled = (next: Settled | null) => {
    settledRef.current = next
    setSettledState(next)
  }
  const openSheet = (next: Sheet) => {
    sheetVersionRef.current = bill.version
    setSheetVersionState(bill.version)
    setSettled(null)
    setSheet(next)
  }

  const invalidate: QueryKey[] = [keys.bill(bill.id), ['bills'], keys.floor, keys.dashboard, keys.order(bill.order_id), ['orders']]
  const apply = async (updated: Bill) => {
    // Drop a poll that started before this answer, so it can't put the old bill back.
    await queryClient.cancelQueries({ queryKey: keys.bill(updated.id), exact: true })
    queryClient.setQueryData(keys.bill(updated.id), updated)
  }

  /** A refused or failed money call: a stale bill closes the sheet with an explanation (and is refetched by useAction). */
  const failed = (err: ApiError) => {
    if (err.kind === 'stale') {
      if (!settledRef.current) setSheet(null)
      toast.info('This bill changed on another device. It has been refreshed — check it and try again.')
    } else if (err.kind !== 'session-ended') {
      toast.error(err.message)
    }
  }
  const quiet = { invalidate, toastError: false, onError: failed }

  const payAction = useAction((v: { key: string; charge: Charge; version: number }) =>
    api.pay(bill.id, v.key, {
      version: v.version,
      payment_method_id: v.charge.method.id,
      amount: v.charge.amount,
      tendered: v.charge.tendered,
      reference: v.charge.reference,
    }), quiet)
  const refundAction = useAction((v: { key: string; target: Refundable; amount: string; reason: string; version: number }) =>
    api.refund(bill.id, v.key, { version: v.version, payment_method_id: v.target.methodId, amount: v.amount, reason: v.reason }), quiet)
  const settleAction = useAction(() => api.settle(bill), { invalidate, success: 'Bill closed', onSuccess: (b) => void apply(b) })
  const discountAction = useAction((v: { type: Bill['discount_type']; value: string; reason: string; version: number }) => {
    const pinned = { id: bill.id, version: v.version }
    return v.type === 'PERCENT' || v.type === 'FIXED' ? api.setDiscount(pinned, v.type, v.value, v.reason) : api.removeDiscount(pinned)
  }, quiet)
  const voidAction = useAction((v: { reason: string; version: number }) => api.voidBill({ id: bill.id, version: v.version }, v.reason), quiet)

  const working = payAction.isPending || refundAction.isPending || settleAction.isPending || discountAction.isPending || voidAction.isPending

  /*
   * Every fresh copy of the bill (poll, refetch or an action's answer) is checked here:
   *  - A pending money intent is only safe to replay while the bill is exactly as it was. Once
   *    the bill has moved on, its key is dropped; the next charge is a new intent, and since
   *    it's still pinned to the old version the server refuses it rather than charging twice.
   *  - The payment drawer never stays armed over a bill that changed under it (someone else's
   *    payment, a void, a discount, or our own lost charge that landed): it closes with a note
   *    saying which. It never closes mid-request, and "Paid in full" is only ever shown from
   *    our own charge's answer.
   */
  const reconcile = useRef<(fresh: Bill) => void>(() => undefined)
  useLayoutEffect(() => {
    reconcile.current = (fresh: Bill) => {
      if (payPending.current && payPending.current.version !== fresh.version) {
        payPending.current = null
        payKey.current.reset()
        ownPaymentMayHaveLanded.current = true
      }
      if (refundPending.current && refundPending.current.version !== fresh.version) {
        refundPending.current = null
        refundKey.current.reset()
      }
      if (sheetRef.current === 'pay' && !settledRef.current && !payInFlight.current && fresh.version !== sheetVersionRef.current) {
        setSheet(null)
        toast.info(billChangedMessage(fresh, ownPaymentMayHaveLanded.current))
        ownPaymentMayHaveLanded.current = false
      }
    }
  })
  useEffect(() => {
    const hash = hashKey(keys.bill(billId))
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success' || event.query.queryHash !== hash) return
      const fresh = event.query.state.data as Bill | undefined
      if (fresh) reconcile.current(fresh)
    })
  }, [queryClient, billId])

  const charge = (c: Charge) => {
    if (payInFlight.current) return
    const version = sheetVersionRef.current
    const key = payKey.current.keyFor(payFingerprint(bill.id, version, { methodId: c.method.id, amount: c.amount, tendered: c.tendered, reference: c.reference }))
    payPending.current = { version }
    payInFlight.current = true
    ownPaymentMayHaveLanded.current = false
    payAction.mutate({ key, charge: c, version }, {
      onSuccess: (updated) => {
        payPending.current = null
        payKey.current.reset()
        if (updated.status === 'PAID') {
          // Our own answer settled it: show the moment, with the change from our own tender.
          // The drawer's "Paid in full" state (a polite live region) says it; no toast on top.
          const change = c.tendered !== null ? subtractMoney(c.tendered, c.amount) : null
          setSettled({ bill: updated, change: change !== null && toCents(change) > 0n ? change : null })
        } else {
          setSheet(null)
          toast.success(`${money(c.amount, updated.currency_code)} received · ${money(updated.balance_due, updated.currency_code)} still due`)
        }
        void apply(updated)
      },
      onError: (err) => {
        if (refused(err)) {
          payPending.current = null
          payKey.current.reset()
        }
      },
      onSettled: () => {
        payInFlight.current = false
        // A poll may have moved the bill while we waited; now that the drawer is free, act on it.
        const latest = queryClient.getQueryData<Bill>(keys.bill(billId))
        if (latest) reconcile.current(latest)
      },
    })
  }

  const doRefund = (target: Refundable, amount: string, reason: string, version: number) => {
    const key = refundKey.current.keyFor(refundFingerprint(bill.id, version, target.methodId, amount, reason))
    refundPending.current = { version }
    refundAction.mutate({ key, target, amount, reason, version }, {
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
        <Button variant="accent" size="lg" icon={Banknote} className="h-14 w-full" disabled={working} onClick={() => openSheet('pay')}
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
            <Button variant="secondary" icon={Tag} className="flex-1" disabled={working} onClick={() => openSheet('discount')}>
              {hasDiscount ? 'Edit discount' : 'Discount'}
            </Button>
          )}
          {actions.refund && !refundPrimary && (
            <Button variant="secondary" icon={Undo2} className="flex-1" disabled={working} onClick={() => openSheet('refund')}>
              Refund
            </Button>
          )}
        </div>
      )}
      {refundPrimary && (
        <Button variant="secondary" size="lg" icon={Undo2} className="w-full" disabled={working} onClick={() => openSheet('refund')}>
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
            <Button variant="danger" icon={Ban} disabled={working} onClick={() => openSheet('void')}>
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
          discountAction.mutate({ type, value, reason, version: sheetVersion }, {
            onSuccess: (updated) => {
              void apply(updated)
              setSheet(null)
              toast.success(`Discount applied · new total ${money(updated.total, updated.currency_code)}`)
            },
          })}
        onRemove={() =>
          discountAction.mutate({ type: null, value: '', reason: '', version: sheetVersion }, {
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
          voidAction.mutate({ reason, version: sheetVersion }, {
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
