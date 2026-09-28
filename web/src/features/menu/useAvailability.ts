import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { keys } from '@/api/queries'
import type { Menu, MenuItem } from '@/api/types'
import { useAction } from '@/features/common/useAction'
import { menuApi } from './api'

/**
 * Sold-out toggle: applied to the cached menu at once, confirmed by the server (its answer is
 * written into the cache — no refetch), rolled back if refused. One request per item at a
 * time. A failure refreshes the menu, but only once no other toggle is in flight, so a
 * refetch never overwrites another item's pending optimistic state (no flicker).
 */
export function useAvailability() {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set())
  const inFlight = useRef(0)
  const needsRefresh = useRef(false)
  const action = useAction((v: { item: MenuItem; available: boolean }) => menuApi.setAvailability(v.item.id, v.item.version, v.available), {
    success: (r) => (r.is_available ? `${r.name} is back on` : `${r.name} marked sold out`),
  })

  const patch = (id: number, fn: (i: MenuItem) => MenuItem) =>
    queryClient.setQueryData<Menu>(keys.menu, (m) => (m ? { ...m, items: m.items.map((i) => (i.id === id ? fn(i) : i)) } : m))

  const toggle = (item: MenuItem, available: boolean) => {
    if (busy.has(item.id)) return
    setBusy((s) => new Set(s).add(item.id))
    inFlight.current += 1
    // A poll landing now would briefly undo the optimistic value.
    void queryClient.cancelQueries({ queryKey: keys.menu })
    patch(item.id, (i) => ({ ...i, is_available: available }))
    action
      .mutateAsync({ item, available })
      .then((updated) => patch(item.id, () => updated))
      .catch(() => {
        // Refused (or stale): put back what the server last said, then refresh to be sure.
        patch(item.id, (i) => ({ ...i, is_available: item.is_available }))
        needsRefresh.current = true
      })
      .finally(() => {
        inFlight.current -= 1
        setBusy((s) => {
          const next = new Set(s)
          next.delete(item.id)
          return next
        })
        if (inFlight.current === 0 && needsRefresh.current) {
          needsRefresh.current = false
          void queryClient.invalidateQueries({ queryKey: keys.menu })
        }
      })
  }
  return { busy, toggle }
}
