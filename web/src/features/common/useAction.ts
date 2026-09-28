import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'
import { useToast } from '@/ui/Toast'

interface ActionOptions<T> {
  /** Queries to refetch after success (and after a stale/invalid-state failure). */
  invalidate?: QueryKey[]
  success?: string | ((result: T) => string | null) | null
  onSuccess?: (result: T) => void
  onError?: (error: ApiError) => void
  /** Show the error as a toast (default). Forms that render field errors inline pass false. */
  toastError?: boolean
}

/**
 * One user action against the API. Never retried automatically; a stale or invalid-state
 * answer refreshes the affected data so the next attempt starts from what's true now.
 */
export function useAction<V, T>(fn: (vars: V) => Promise<T>, opts: ActionOptions<T> = {}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation<T, ApiError, V>({
    mutationFn: fn,
    onSuccess: (result) => {
      opts.invalidate?.forEach((key) => void queryClient.invalidateQueries({ queryKey: key }))
      const msg = typeof opts.success === 'function' ? opts.success(result) : opts.success
      if (msg) toast.success(msg)
      opts.onSuccess?.(result)
    },
    onError: (error) => {
      const err = error instanceof ApiError ? error : new ApiError('unexpected', 'Something unexpected happened. Try again.')
      if (err.kind === 'stale' || err.kind === 'invalid-state' || err.kind === 'not-found') {
        opts.invalidate?.forEach((key) => void queryClient.invalidateQueries({ queryKey: key }))
      }
      if (opts.toastError !== false && err.kind !== 'session-ended') toast.error(err.message)
      opts.onError?.(err)
    },
  })
}
