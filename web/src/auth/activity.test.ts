import { idleSeconds, markReported, setReturnHandler, trackActivity } from './activity'

describe('activity reporting', () => {
  it('reports the first interaction after a quiet spell once, and only then', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-28T10:00:00Z'))
    trackActivity()
    markReported()
    const onReturn = vi.fn()
    setReturnHandler(onReturn)

    vi.setSystemTime(new Date('2026-09-28T10:03:00Z'))
    window.dispatchEvent(new Event('pointerdown'))
    expect(onReturn).not.toHaveBeenCalled() // recent report: nothing to tell

    vi.setSystemTime(new Date('2026-09-28T10:09:00Z'))
    window.dispatchEvent(new Event('keydown'))
    window.dispatchEvent(new Event('keydown'))
    expect(onReturn).toHaveBeenCalledTimes(1)
    expect(idleSeconds()).toBe(0)

    vi.setSystemTime(new Date('2026-09-28T10:10:30Z'))
    expect(idleSeconds()).toBe(90)
    setReturnHandler(null)
    vi.useRealTimers()
  })
})
