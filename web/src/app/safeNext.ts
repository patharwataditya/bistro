/** Only same-app paths are honoured as a post-login destination (no open redirects). */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || hasControlOrBackslash(next)) return null
  try {
    const url = new URL(next, window.location.origin)
    // Dot segments can normalise to "//host", which a browser reads as another origin.
    if (url.origin !== window.location.origin || url.pathname.startsWith('//')) return null
    return url.pathname + url.search + url.hash
  } catch {
    return null
  }
}

function hasControlOrBackslash(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    if (c < 0x20 || c === 0x7f || ch === '\\') return true
  }
  return false
}
