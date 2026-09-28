import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { Order } from '@/api/types'

export const STALE_NOTICE = 'Someone else changed this check while this was open. It has been refreshed — check it and try again.'

/**
 * The version a dialog acts on: the check as it was when the dialog opened (after the
 * quantities still being typed were saved), never whatever the last poll brought in. So
 * if another device changes the check meanwhile, the server answers 409 instead of the
 * other edit being silently overwritten. On that 409 the check is refreshed, the new
 * version captured and `stale` set so the dialog can explain.
 */
export function useOpenVersion(order: Order, open: boolean, flush: () => Promise<Order | null>) {
  const qc = useQueryClient()
  const [wasOpen, setWasOpen] = useState(false)
  const [version, setVersion] = useState<number | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [stale, setStale] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    setVersion(open ? order.version : null)
    setPreparing(open)
    setStale(false)
  }

  // Quantities typed in the last moments are saved first; the version is taken after them.
  useEffect(() => {
    if (!open) return
    let alive = true
    flush()
      .then((saved) => {
        if (alive && saved) setVersion(saved.version)
      }, () => undefined)
      .finally(() => {
        if (alive) setPreparing(false)
      })
    return () => {
      alive = false
    }
  }, [open, flush])

  const onError = (err: ApiError) => {
    if (err.kind !== 'stale') return
    setStale(true)
    void qc.refetchQueries({ queryKey: keys.order(order.id) }).then(() => {
      const fresh = qc.getQueryData<Order>(keys.order(order.id))
      if (fresh) setVersion(fresh.version)
    })
  }

  return {
    /** null until captured (the dialog's action waits). */
    version: preparing ? null : version,
    stale,
    onError,
    /** The stale explanation replaces the generic toast. */
    toastError: (err: ApiError) => err.kind !== 'stale',
  }
}
