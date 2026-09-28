import type { QueryClient } from '@tanstack/react-query'
import { keys } from '@/api/queries'

/**
 * Milliseconds to add to the browser clock to get the server's clock, from the freshest cached
 * response that carries `server_time` (the dashboard or the kitchen board), or 0 when neither
 * has been loaded in this session.
 *
 * Reports' own payload has no server time, and fetching the dashboard just for its clock
 * would need a permission Reports doesn't. So a Reports page opened directly, before any
 * clocked screen, falls back to the browser clock; that only matters when the device clock is
 * wrong by enough to cross the restaurant's midnight, and the range label always shows which
 * day is being reported.
 */
export function serverClockOffset(client: QueryClient): number {
  let best: { at: number; offset: number } | null = null
  for (const key of [keys.dashboard, keys.kitchen]) {
    const state = client.getQueryState<{ server_time?: string }>(key)
    const serverMs = state?.data?.server_time ? Date.parse(state.data.server_time) : Number.NaN
    if (!state || !Number.isFinite(serverMs) || state.dataUpdatedAt === 0) continue
    if (!best || state.dataUpdatedAt > best.at) best = { at: state.dataUpdatedAt, offset: serverMs - state.dataUpdatedAt }
  }
  return best?.offset ?? 0
}

/** "Now" on the server's clock (see `serverClockOffset`). */
export function serverNow(client: QueryClient): number {
  return Date.now() + serverClockOffset(client)
}
