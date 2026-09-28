/**
 * When the person last touched this tab. Refreshes report it so the server can end browser
 * sessions after a period without interaction; background polling never counts as activity.
 *
 * The server only learns about interaction on a refresh (about every 15 minutes). So the first
 * interaction after a quiet spell reports it straight away: someone who comes back to work
 * just before the idle limit is never timed out mid-task, while a walk-up after the limit
 * still is (the server judges on the last *reported* activity).
 */
const QUIET_MS = 5 * 60_000

let lastInteraction = Date.now()
let lastReported = Date.now()
let installed = false
let onReturn: (() => void) | null = null

export function trackActivity(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  const mark = () => {
    const now = Date.now()
    lastInteraction = now
    if (onReturn && now - lastReported > QUIET_MS) {
      lastReported = now
      onReturn()
    }
  }
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
    window.addEventListener(type, mark, { passive: true, capture: true })
  }
}

export function idleSeconds(now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - lastInteraction) / 1000))
}

/** Called after every refresh: the server now knows about activity up to this moment. */
export function markReported(now: number = Date.now()): void {
  lastReported = now
}

/** Run `fn` on the first interaction after a quiet spell (null to stop). */
export function setReturnHandler(fn: (() => void) | null): void {
  onReturn = fn
}
