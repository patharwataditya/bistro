import { describe, expect, it } from 'vitest'
import { ServerClock } from './clock'

describe('ServerClock', () => {
  it('keeps the least-delayed sample, so network jitter never ticks timers backwards', () => {
    const clock = new ServerClock()
    // The server runs 5 s ahead; responses arrive after 50 ms, then 900 ms, then 20 ms.
    const truth = 5_000
    let local = 1_000_000
    const readings: number[] = []
    for (const delay of [50, 900, 20, 400, 700, 30]) {
      clock.sample(local + truth, local + delay)
      readings.push(clock.now(local + delay))
      local += 1_000
      readings.push(clock.now(local))
    }
    for (let i = 1; i < readings.length; i++) expect(readings[i]).toBeGreaterThanOrEqual(readings[i - 1] ?? 0)
    // Estimate converges on the fastest sample (20 ms short of the truth).
    expect(clock.now(local) - local).toBe(truth - 20)
  })

  it('holds rather than stepping back when the best sample leaves the window', () => {
    const clock = new ServerClock()
    let local = 0
    clock.sample(10_000, 0) // offset 10 000 (the fast sample)
    for (let i = 0; i < 7; i++) {
      local += 1
      clock.sample(local + 9_500, local)
    }
    const before = clock.now(local)
    expect(before).toBe(local + 10_000)
    // One more slow sample pushes the fast one out: the estimate drops to 9 500, and the
    // reading holds instead of dropping half a second, then carries on from there.
    local += 1
    clock.sample(local + 9_500, local)
    expect(clock.now(local + 100)).toBe(before)
    expect(clock.now(local + 600)).toBe(local + 600 + 9_500)
  })

  it('follows a device clock change instead of freezing', () => {
    const clock = new ServerClock()
    clock.sample(100_000, 100_000)
    expect(clock.now(100_000)).toBe(100_000)
    // The device clock is set an hour ahead: the offset jumps and the window starts over.
    clock.sample(101_000, 101_000 + 3_600_000)
    expect(clock.now(101_000 + 3_600_000)).toBe(101_000)
  })
})
