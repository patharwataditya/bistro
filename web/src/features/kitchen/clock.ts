import { useEffect, useSyncExternalStore } from 'react'

/** Samples kept for the offset estimate: about half a minute of board polls. */
const WINDOW = 8
/** A jump this large means the device clock was changed, not network noise: start over. */
const RESET_MS = 30_000

/**
 * Server time from a stream of `server_time` samples. Each sample is stamped by the server
 * *before* the response travels back, so `server - received` is always an underestimate of
 * the true offset by that response's delay; the largest offset in the recent window is the
 * least-delayed sample and the best estimate. Readings never go backwards: when the estimate
 * drops (a fast sample left the window), the clock holds until real time catches up.
 */
export class ServerClock {
  private samples: number[] = []
  private offset = 0
  private last = Number.NEGATIVE_INFINITY

  sample(serverMs: number, receivedAtMs: number): void {
    if (!Number.isFinite(serverMs) || !Number.isFinite(receivedAtMs)) return
    const o = serverMs - receivedAtMs
    if (this.samples.length > 0 && Math.abs(o - this.offset) > RESET_MS) {
      this.samples = []
      this.last = Number.NEGATIVE_INFINITY
    }
    this.samples.push(o)
    if (this.samples.length > WINDOW) this.samples.shift()
    this.offset = Math.max(...this.samples)
  }

  now(localMs: number): number {
    const t = localMs + this.offset
    // Hold rather than tick backwards; a big backwards step is a device clock change — follow it.
    if (t < this.last && this.last - t < RESET_MS) return this.last
    this.last = t
    return t
  }
}

/**
 * One shared per-second clock for the kitchen board, kept on server time. Only the pieces
 * that read it (timers and urgency bars) re-render on each tick — never the whole board —
 * and every card flips its seconds at the same instant.
 */
const serverClock = new ServerClock()
let current = serverClock.now(Date.now())
let timer: number | null = null
const listeners = new Set<() => void>()

function tick(): void {
  current = serverClock.now(Date.now())
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (timer === null) {
    current = serverClock.now(Date.now())
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

/**
 * Feeds the clock each time the board reports its `server_time`, stamped with when that
 * response arrived (the query's `dataUpdatedAt`), not when React got round to rendering it.
 */
export function useSyncServerClock(serverTime: string | undefined, receivedAt: number): void {
  useEffect(() => {
    if (!serverTime) return
    serverClock.sample(new Date(serverTime).getTime(), receivedAt || Date.now())
    tick()
  }, [serverTime, receivedAt])
}

/** Server "now", updated once a second. */
export function useKitchenNow(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
