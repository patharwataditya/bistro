import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router'
import { ApiError } from '@/api/errors'
import { keys, useMenu, useOrder } from '@/api/queries'
import type { MenuItem, Order } from '@/api/types'
import { P } from '@/auth/permissions'
import { useMe } from '@/auth/session'
import { IntentKey } from '@/lib/idempotency'
import { useServerNow } from '@/lib/live'
import { cn } from '@/ui/cn'
import { Segmented } from '@/ui/Controls'
import { ConfirmDialog } from '@/ui/Overlay'
import { ErrorState, Skeleton, SkeletonList } from '@/ui/States'
import { useToast } from '@/ui/Toast'
import { orderApi } from './api'
import { MenuBrowser, MenuSkeleton } from './MenuBrowser'
import { OrderPanel, type CartControls } from './OrderPanel'
import type { ActionContext } from './OrderActions'
import { putOrder } from './orderCache'
import {
  abilities, addToCart, cartCount, cartFingerprint, cartQuantityOf, firedUnits, setCartLine, shouldBlockLeave, subtractCart,
  type CartLine,
} from './orderModel'
import { asApiError, useOrderMutation } from './useOrderMutation'
import { useQuantityDrafts } from './useQuantityDrafts'
import { useMediaQuery, WIDE } from './useMediaQuery'

export default function OrderPage() {
  const { orderId } = useParams()
  const id = Number(orderId)
  if (!Number.isInteger(id) || id <= 0) {
    return <ErrorState error={new ApiError('not-found', 'That check doesn’t exist.')} />
  }
  // A new check (e.g. after a split) starts with a fresh cart and fresh intents.
  return <OrderScreen key={id} orderId={id} />
}

type Pane = 'check' | 'menu'

function OrderScreen({ orderId }: { orderId: number }) {
  const { can } = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const query = useOrder(orderId)
  const order = query.data
  const now = useServerNow(undefined, 30_000)
  const wide = useMediaQuery(WIDE)
  const [pane, setPane] = useState<Pane>('check')

  const a = order ? abilities(order, can) : null
  const showMenu = !!a?.edit && can(P.MENU_VIEW)
  const menu = useMenu()

  const quantities = useQuantityDrafts(orderId)
  const { flush } = quantities

  // ----- Local cart: never touched by polling.
  const [cart, setCart] = useState<CartLine[]>([])
  const [addIntent] = useState(() => new IntentKey())
  const [addFireIntent] = useState(() => new IntentKey())
  const [fireIntent] = useState(() => new IntentKey())
  const [billIntent] = useState(() => new IntentKey())

  /** Set just before this screen navigates away after a successful action. */
  const leaving = useRef(false)
  const latest = useCallback((): Order | undefined => qc.getQueryData<Order>(keys.order(orderId)), [qc, orderId])

  const onAdd = (item: MenuItem, quantity: number, note: string) => {
    if (!item.is_available) return
    setCart((c) => addToCart(c, item, quantity, note))
  }

  const submit = useOrderMutation(orderId, async ({ send, lines }: { send: boolean; lines: CartLine[] }) => {
    // Quantities typed on existing lines go first: the server may merge these new lines
    // into those very lines, and a later absolute quantity would undo the merge.
    await flush()
    const before = latest()
    const added = putOrder(qc, await orderApi.addItems(orderId, lines, addIntent.keyFor(cartFingerprint(orderId, lines))))
    quantities.rebase(before, added)
    if (!send) return { order: added, sent: 0, sendError: null as ApiError | null }
    try {
      const current = (await flush()) ?? latest() ?? added
      const fired = await orderApi.fire(orderId, current.version, addFireIntent.keyFor(`fire:${orderId}:${current.version}`))
      return { order: fired, sent: firedUnits(current, fired), sendError: null }
    } catch (e) {
      return { order: latest() ?? added, sent: 0, sendError: asApiError(e) }
    }
  }, {
    onSuccess: (r, { send, lines }) => {
      putOrder(qc, r.order)
      // Only what was submitted comes off: taps made while it was in flight stay.
      setCart((c) => subtractCart(c, lines))
      addIntent.reset()
      addFireIntent.reset()
      if (r.sendError) {
        // The items are safely on the check; only the send failed.
        toast.error(`Added, but not sent: ${r.sendError.message}`)
        void qc.invalidateQueries({ queryKey: keys.order(orderId) })
      } else if (send) {
        toast.success(`Sent ${r.sent} item${r.sent === 1 ? '' : 's'} to the kitchen`)
      } else {
        toast.success('Added to the check')
      }
      if (!wide) setPane('check')
    },
    onError: (err) => {
      // e.g. "Sold out: …" — show the menu as it is now.
      if (err.kind === 'validation') void qc.invalidateQueries({ queryKey: keys.menu })
    },
  })

  const fire = useOrderMutation(orderId, async () => {
    // The kitchen must get what the screen shows, including clicks from the last 400 ms.
    const current = (await flush()) ?? latest()
    if (!current) throw new ApiError('unexpected', 'The check isn’t loaded yet. Try again.')
    const fired = await orderApi.fire(orderId, current.version, fireIntent.keyFor(`fire:${orderId}:${current.version}`))
    return { order: fired, sent: firedUnits(current, fired) }
  }, {
    success: (r) => `Sent ${r.sent} item${r.sent === 1 ? '' : 's'} to the kitchen`,
    onSuccess: (r) => {
      putOrder(qc, r.order)
      fireIntent.reset()
    },
  })

  const bill = useOrderMutation(orderId, async () => {
    const current = (await flush()) ?? latest()
    if (!current) throw new ApiError('unexpected', 'The check isn’t loaded yet. Try again.')
    return orderApi.createBill(orderId, current.version, billIntent.keyFor(`bill:${orderId}:${current.version}`))
  }, {
    onSuccess: (b) => {
      billIntent.reset()
      void qc.invalidateQueries({ queryKey: keys.order(orderId) })
      leaving.current = true
      navigate(`/bills/${b.id}`)
    },
  })

  // ----- Don't lose unsent new items by leaving.
  const count = cartCount(cart)
  const canEdit = !!a?.edit
  const blocker = useBlocker(({ currentLocation, nextLocation }) => shouldBlockLeave({
    cartUnits: count,
    // The cache, not this render: an action may have closed the check a moment ago.
    editable: canEdit && latest()?.status === 'OPEN',
    leaving: leaving.current,
    samePath: currentLocation.pathname === nextLocation.pathname,
  }))
  useEffect(() => {
    if (count === 0 || !canEdit) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [count, canEdit])

  if (query.isPending) return <OrderSkeleton />
  if (!order || !a) {
    return <ErrorState error={query.error ?? new ApiError('unexpected', 'Couldn’t load this check.')} onRetry={() => void query.refetch()} className="py-24" />
  }

  const actions: ActionContext = {
    flush,
    cartUnits: count,
    discardCart: () => setCart([]),
    leave: () => {
      leaving.current = true
      setCart([])
    },
  }

  const cartControls: CartControls | null = showMenu
    ? {
      lines: cart,
      setLine: (key, q) => setCart((c) => setCartLine(c, key, q)),
      clear: () => setCart([]),
      submit: (send) => submit.mutate({ send, lines: cart }),
      submitting: submit.isPending ? (submit.variables?.send ? 'send' : 'add') : null,
    }
    : null

  const panel = (
    <OrderPanel
      order={order}
      can={a}
      now={now}
      staleError={query.isError ? query.error : null}
      quantities={quantities}
      actions={actions}
      cart={cartControls}
      onFire={() => fire.mutate(undefined)}
      firing={fire.isPending}
      onBill={() => bill.mutate(undefined)}
      billing={bill.isPending}
      className={showMenu ? 'lg:sticky lg:top-20 lg:h-[calc(100dvh-7.5rem)] lg:self-start lg:overflow-hidden' : 'min-h-[320px]'}
    />
  )

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      {showMenu ? (
        <>
          <Segmented
            ariaLabel="View"
            options={['check', 'menu'] as const}
            value={pane}
            onChange={setPane}
            label={(p) => (p === 'check' ? 'Check' : 'Add items')}
            badge={(p) => (p === 'menu' ? count : null)}
            className="mb-4 lg:hidden"
          />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[168px_minmax(0,1fr)_380px] min-[1440px]:grid-cols-[200px_minmax(0,1fr)_400px]">
            {menu.data ? (
              <MenuBrowser
                menu={menu.data}
                currency={order.currency_code}
                quantityOf={(id) => cartQuantityOf(cart, id)}
                onAdd={onAdd}
                className={cn(pane !== 'menu' && 'max-lg:hidden')}
              />
            ) : menu.isPending ? (
              <>
                <div className="hidden xl:block"><SkeletonList rows={5} /></div>
                <div className={cn(pane !== 'menu' && 'max-lg:hidden')}><MenuSkeleton /></div>
              </>
            ) : (
              <>
                <div className="hidden xl:block" />
                <div className={cn(pane !== 'menu' && 'max-lg:hidden')}>
                  <ErrorState error={menu.error ?? new Error('Couldn’t load the menu.')} onRetry={() => void menu.refetch()} />
                </div>
              </>
            )}
            <div className={cn('lg:contents', pane !== 'check' && 'max-lg:hidden')}>{panel}</div>
          </div>
        </>
      ) : (
        <div className="mx-auto flex w-full max-w-[720px] flex-col">{panel}</div>
      )}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}
        title={`Discard ${count} item${count === 1 ? '' : 's'}?`}
        message="They haven't been added to the check yet."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setCart([])
          if (blocker.state === 'blocked') blocker.proceed()
        }}
      />
    </div>
  )
}

function OrderSkeleton() {
  return (
    <div role="status" aria-label="Loading the check" className="mx-auto grid w-full max-w-[1600px] gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[168px_minmax(0,1fr)_380px] min-[1440px]:grid-cols-[200px_minmax(0,1fr)_400px]">
      <div className="hidden xl:block"><SkeletonList rows={5} /></div>
      <div className="max-lg:hidden"><MenuSkeleton /></div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28" />
        <SkeletonList rows={5} />
      </div>
    </div>
  )
}
