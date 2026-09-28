import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { Order } from '@/api/types'
import { useToast } from '@/ui/Toast'
import { putOrder } from './orderCache'

function isOrder(v: unknown): v is Order {
  return typeof v === 'object' && v !== null && 'order_number' in v && 'items' in v && 'totals' in v
}

export function asApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError('unexpected', 'Something unexpected happened. Try again.')
}

interface Options<V, T> {
  success?: string | ((result: T, vars: V) => string | null) | null
  onSuccess?: (result: T, vars: V) => void
  onError?: (error: ApiError, vars: V) => void
  /** Toast the error (default). Dialogs that explain it inline return false. */
  toastError?: (error: ApiError) => boolean
}

/**
 * useAction for the order screen, plus Android's "generation" guard: any poll in flight is
 * cancelled before the action runs, and the order the server returns replaces the cache
 * unless the cache already holds a newer version — so neither a slow poll nor a late
 * answer can paint an older check over the result of what was just done.
 */
export function useOrderMutation<V, T>(orderId: number, fn: (vars: V) => Promise<T>, opts: Options<V, T> = {}) {
  const qc = useQueryClient()
  const toast = useToast()
  const orderKey = keys.order(orderId)
  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: keys.floor })
    void qc.invalidateQueries({ queryKey: ['orders'] })
  }
  return useMutation<T, ApiError, V>({
    mutationFn: async (vars) => {
      await qc.cancelQueries({ queryKey: orderKey })
      return fn(vars)
    },
    onSuccess: (result, vars) => {
      if (isOrder(result) && result.id === orderId) putOrder(qc, result)
      else void qc.invalidateQueries({ queryKey: orderKey })
      refreshAll()
      const msg = typeof opts.success === 'function' ? opts.success(result, vars) : opts.success
      if (msg) toast.success(msg)
      opts.onSuccess?.(result, vars)
    },
    onError: (error, vars) => {
      const err = asApiError(error)
      // Stale or no-longer-valid: start the next attempt from what's true now.
      if (err.kind === 'stale' || err.kind === 'invalid-state' || err.kind === 'not-found' || err.kind === 'conflict') {
        void qc.invalidateQueries({ queryKey: orderKey })
        refreshAll()
      }
      if (err.kind !== 'session-ended' && (opts.toastError?.(err) ?? true)) toast.error(err.message)
      opts.onError?.(err, vars)
    },
  })
}
