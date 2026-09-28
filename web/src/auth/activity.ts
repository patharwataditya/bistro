/**
 * When the person last touched this tab. Refreshes report it so the server can end browser
 * sessions after a period without interaction; background polling never counts as activity.
 */
let lastInteraction = Date.now()
let installed = false

export function trackActivity(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  const mark = () => {
    lastInteraction = Date.now()
  }
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
    window.addEventListener(type, mark, { passive: true, capture: true })
  }
}

export function idleSeconds(now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - lastInteraction) / 1000))
}
