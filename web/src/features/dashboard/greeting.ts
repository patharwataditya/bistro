/** Time-of-day greeting in the restaurant's zone, matching Android's HomeScreen. */
export function hourInZone(zone: string, now: number = Date.now()): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(now))
  return Number(h) % 24
}

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour <= 11) return 'Good morning'
  if (hour >= 12 && hour <= 16) return 'Good afternoon'
  return 'Good evening'
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}

/** "Good morning, Maya" — just the greeting when the name would make it too long. */
export function greeting(fullName: string, zone: string, now: number = Date.now()): string {
  const g = greetingFor(hourInZone(zone, now))
  const name = firstName(fullName)
  const full = name ? `${g}, ${name}` : g
  return full.length <= 32 ? full : g
}

/** "Monday, 28 September" for a YYYY-MM-DD business date. */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)))
}
