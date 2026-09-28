import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { keys } from '@/api/queries'
import type { Order } from '@/api/types'
import { useToast } from '@/ui/Toast'
import { orderApi } from './api'
import { asApiError } from './useOrderMutation'

const DEBOUNCE_MS = 400

/**
 * Every stepper click counts: the value updates locally at once and the final quantity is
 * sent once the clicks stop (400 ms), instead of dropping clicks while a request is in
 * flight (Android OrderViewModel.setQuantity / flushQuantities).
 */
export function useQuantityDrafts(orderId: number) {
  const qc = useQueryClient()
  const toast = useToast()
  const [drafts, setDrafts] = useState<ReadonlyMap<number, number>>(() => new Map())
  const draftsRef = useRef<Map<number, number>>(new Map())
  const timers = useRef(new Map<number, number>())

  const publish = useCallback(() => setDrafts(new Map(draftsRef.current)), [])

  const apply = useCallback(async (order: Order) => {
    await qc.cancelQueries({ queryKey: keys.order(orderId) })
    qc.setQueryData(keys.order(orderId), order)
    void qc.invalidateQueries({ queryKey: keys.floor })
  }, [qc, orderId])

  const send = useCallback(async (itemId: number) => {
    timers.current.delete(itemId)
    const target = draftsRef.current.get(itemId)
    if (target === undefined) return
    try {
      const order = await orderApi.updateItem(orderId, itemId, { quantity: target })
      if (draftsRef.current.get(itemId) === target) {
        draftsRef.current.delete(itemId)
        publish()
      }
      await apply(order)
    } catch (e) {
      const err = asApiError(e)
      if (draftsRef.current.get(itemId) === target) {
        draftsRef.current.delete(itemId)
        publish()
      }
      if (err.kind !== 'session-ended') toast.error(err.message)
      void qc.invalidateQueries({ queryKey: keys.order(orderId) })
    }
  }, [orderId, apply, publish, qc, toast])

  const set = useCallback((itemId: number, quantity: number) => {
    draftsRef.current.set(itemId, quantity)
    publish()
    const prev = timers.current.get(itemId)
    if (prev !== undefined) window.clearTimeout(prev)
    timers.current.set(itemId, window.setTimeout(() => void send(itemId), DEBOUNCE_MS))
  }, [publish, send])

  /**
   * Send every change still waiting on its debounce, right now. Resolves to the latest order
   * (or null when nothing was waiting); rejects if an update failed, so what follows (the
   * send to the kitchen) never runs on quantities the server doesn't have.
   */
  const flush = useCallback(async (): Promise<Order | null> => {
    if (draftsRef.current.size === 0) return null
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current.clear()
    const pending = [...draftsRef.current.entries()]
    let last: Order | null = null
    try {
      for (const [itemId, target] of pending) {
        last = await orderApi.updateItem(orderId, itemId, { quantity: target })
      }
    } finally {
      draftsRef.current.clear()
      publish()
      if (last) await apply(last)
    }
    return last
  }, [orderId, apply, publish])

  // Leaving mid-debounce must not lose the edit: finish it in the background.
  useEffect(() => {
    const timerMap = timers.current
    const draftMap = draftsRef.current
    return () => {
      timerMap.forEach((t) => window.clearTimeout(t))
      for (const [itemId, target] of draftMap) {
        void orderApi.updateItem(orderId, itemId, { quantity: target }).catch(() => undefined)
      }
    }
  }, [orderId])

  return { drafts, set, flush }
}
