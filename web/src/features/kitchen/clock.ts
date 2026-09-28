import { useEffect, useSyncExternalStore } from 'react'

/**
 * One shared per-second clock for the kitchen board, kept on server time. Only the pieces
 * that read it (timers and urgency bars) re-render on each tick — never the whole board —
 * and every card flips its seconds at the same instant.
 */
let offset = 0
let current = Date.now()
let timer: number | null = null
const listeners = new Set<() => void>()

function tick(): void {
  current = Date.now() + offset
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (timer === null) {
    current = Date.now() + offset
    timer = window.setInterval(tick, 1_000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }
}

const snapshot = (): number => current

/** Measures the browser-to-server offset each time the board reports its `server_time`. */
export function useSyncServerClock(serverTime: string | undefined): void {
  useEffect(() => {
    if (!serverTime) return
    offset = new Date(serverTime).getTime() - Date.now()
    tick()
  }, [serverTime])
}

/** Server "now", updated once a second. */
export function useKitchenNow(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
