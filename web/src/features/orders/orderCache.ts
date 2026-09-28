import type { QueryClient } from '@tanstack/react-query'
import { keys } from '@/api/queries'
import type { Order } from '@/api/types'

/** Keep whichever is newer: a late answer must never paint an older check over a newer one. */
export function newerOrder(cached: Order | undefined, incoming: Order): Order {
  return cached && cached.id === incoming.id && cached.version > incoming.version ? cached : incoming
}

/**
 * The only way order screens write an order into the cache. Responses can arrive out of
 * order (a slow PATCH answered after a later fire), so an older version is ignored.
 * Returns what the cache holds afterwards.
 */
export function putOrder(qc: QueryClient, order: Order): Order {
  const key = keys.order(order.id)
  qc.setQueryData<Order>(key, (cached) => newerOrder(cached, order))
  return qc.getQueryData<Order>(key) ?? order
}
