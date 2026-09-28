import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { Order } from '@/api/types'
import { useToast } from '@/ui/Toast'
import { orderApi } from './api'
import { putOrder } from './orderCache'
import { rebaseDrafts } from './orderModel'
import { asApiError } from './useOrderMutation'

export const DEBOUNCE_MS = 400
/** After a network/server failure an unsaved quantity is tried again this often. */
export const RETRY_MS = 5_000

export interface QuantityDrafts {
  /** Quantities shown but not yet confirmed by the server, by order item id. */
  drafts: ReadonlyMap<number, number>
  /** Items whose last save failed and that are waiting to be tried again. */
  failed: ReadonlySet<number>
  set: (itemId: number, quantity: number) => void
  /**
   * Send now whatever is waiting (on a debounce or a retry) and wait for every save in
   * flight. Resolves to the freshest cached order (null when nothing was waiting); rejects
   * when a quantity couldn't be saved, so what follows never runs on quantities the server
   * doesn't have.
   */
  flush: () => Promise<Order | null>
  /** Forget the item's unsent quantity and wait for any save of it already in flight. */
  cancel: (itemId: number) => Promise<void>
  /** Lines were just added (the server may have merged them into these items): keep the typed deltas. */
  rebase: (before: Order | undefined, after: Order) => void
  /** Try a failed save again now. */
  retry: (itemId: number) => void
}

interface View {
  publish: (drafts: ReadonlyMap<number, number>, failed: ReadonlySet<number>) => void
  toast: { error: (text: string) => void }
}

/**
 * The quantity saver behind the order screen's steppers (Android OrderViewModel's
 * quantity jobs + flushQuantities). Saves of one item run strictly one after another, so
 * the server always ends on the last value typed and answers can't cross; flush() waits
 * for saves already in flight instead of sending the same PATCH again. A save that fails
 * for a network reason keeps its value, is shown as not saved and is retried; one the
 * server refuses is dropped and the check refreshed.
 */
export class QuantitySaver {
  private drafts = new Map<number, number>()
  private failed = new Set<number>()
  private timers = new Map<number, ReturnType<typeof setTimeout>>()
  private inflight = new Map<number, Promise<void>>()
  private view: View | null = null

  constructor(private readonly qc: QueryClient, private readonly orderId: number) {}

  attach(view: View | null) {
    this.view = view
  }

  private publish() {
    this.view?.publish(new Map(this.drafts), new Set(this.failed))
  }

  private clearTimer(itemId: number) {
    const t = this.timers.get(itemId)
    if (t !== undefined) clearTimeout(t)
    this.timers.delete(itemId)
  }

  /** One PATCH with whatever the item's latest typed quantity is when its turn comes. */
  private async saveOnce(itemId: number): Promise<void> {
    const target = this.drafts.get(itemId)
    if (target === undefined) return
    try {
      const order = await orderApi.updateItem(this.orderId, itemId, { quantity: target })
      if (this.drafts.get(itemId) === target) {
        this.drafts.delete(itemId)
        this.failed.delete(itemId)
      }
      putOrder(this.qc, order)
      this.publish()
      void this.qc.invalidateQueries({ queryKey: keys.floor })
    } catch (e) {
      const err = asApiError(e)
      // Cancelled (the line is being removed) while this was in flight: nothing to report.
      if (!this.drafts.has(itemId)) return
      if (err.retryable) {
        this.failed.add(itemId)
      } else {
        // Refused (line already sent or removed, check closed…): show what's true now.
        if (this.drafts.get(itemId) === target) this.drafts.delete(itemId)
        this.failed.delete(itemId)
        void this.qc.invalidateQueries({ queryKey: keys.order(this.orderId) })
      }
      this.publish()
      throw err
    }
  }

  /** Queue a save of the item behind any save of it already in flight. */
  private save(itemId: number): Promise<void> {
    this.clearTimer(itemId)
    const prev = this.inflight.get(itemId) ?? Promise.resolve()
    const run: Promise<void> = prev.catch(() => undefined).then(() => this.saveOnce(itemId)).finally(() => {
      if (this.inflight.get(itemId) === run) this.inflight.delete(itemId)
    })
    this.inflight.set(itemId, run)
    return run
  }

  private schedule(itemId: number, delay: number) {
    this.clearTimer(itemId)
    this.timers.set(itemId, setTimeout(() => {
      const wasFailed = this.failed.has(itemId)
      this.save(itemId).catch((e: ApiError) => this.afterBackgroundFailure(itemId, e, wasFailed))
    }, delay))
  }

  private afterBackgroundFailure(itemId: number, e: ApiError, wasFailed: boolean) {
    if (e.retryable) {
      // Keep it and try again; say so once, not on every retry.
      if (!wasFailed) this.view?.toast.error(`Quantity not saved yet: ${e.message}`)
      if (this.drafts.has(itemId) && !this.timers.has(itemId)) this.schedule(itemId, RETRY_MS)
    } else if (e.kind !== 'session-ended') {
      this.view?.toast.error(e.message)
    }
  }

  set = (itemId: number, quantity: number) => {
    this.drafts.set(itemId, quantity)
    this.publish()
    this.schedule(itemId, DEBOUNCE_MS)
  }

  retry = (itemId: number) => {
    if (this.drafts.has(itemId)) this.schedule(itemId, 0)
  }

  flush = async (): Promise<Order | null> => {
    const ids = new Set([...this.drafts.keys(), ...this.inflight.keys()])
    if (ids.size === 0) return null
    // save() chains behind what's in flight; an item saved there already becomes a no-op.
    const results = await Promise.allSettled([...ids].map((id) => this.save(id)))
    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failure) {
      // What's still unsaved stays on screen and keeps retrying.
      for (const id of this.drafts.keys()) if (!this.timers.has(id)) this.schedule(id, RETRY_MS)
      const err = asApiError(failure.reason)
      throw new ApiError(err.kind, `Quantity changes aren't saved: ${err.message}`, { status: err.status, code: err.code })
    }
    return this.qc.getQueryData<Order>(keys.order(this.orderId)) ?? null
  }

  cancel = async (itemId: number): Promise<void> => {
    this.clearTimer(itemId)
    this.drafts.delete(itemId)
    this.failed.delete(itemId)
    this.publish()
    await this.inflight.get(itemId)?.catch(() => undefined)
  }

  rebase = (before: Order | undefined, after: Order) => {
    if (this.drafts.size === 0) return
    const next = rebaseDrafts(this.drafts, before, after)
    const changed = [...next].filter(([id, q]) => this.drafts.get(id) !== q).map(([id]) => id)
    if (changed.length === 0) return
    this.drafts = new Map(next)
    this.publish()
    // A save already in flight carries the old absolute value; the rebased one follows it.
    for (const id of changed) this.schedule(id, DEBOUNCE_MS)
  }

  /** Leaving the screen: stop the timers but finish every unsaved edit in the background. */
  detach() {
    this.view = null
    for (const id of [...this.timers.keys()]) this.clearTimer(id)
    for (const id of this.drafts.keys()) void this.save(id).catch(() => undefined)
  }
}

export function useQuantityDrafts(orderId: number): QuantityDrafts {
  const qc = useQueryClient()
  const toast = useToast()
  const [saver] = useState(() => new QuantitySaver(qc, orderId))
  const [state, setState] = useState<{ drafts: ReadonlyMap<number, number>; failed: ReadonlySet<number> }>(
    () => ({ drafts: new Map(), failed: new Set() }),
  )

  useEffect(() => {
    saver.attach({ publish: (drafts, failed) => setState({ drafts, failed }), toast })
    return () => saver.attach(null)
  }, [saver, toast])
  useEffect(() => () => saver.detach(), [saver])

  return {
    drafts: state.drafts,
    failed: state.failed,
    set: saver.set,
    flush: saver.flush,
    cancel: saver.cancel,
    rebase: saver.rebase,
    retry: saver.retry,
  }
}
