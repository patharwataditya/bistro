import { useEffect, useRef, useState } from 'react'

/**
 * Keeps elapsed-time displays on server time: the offset between the browser clock and the
 * API's `server_time` is measured on each fetch and applied to "now", which ticks every
 * `tickMs` without refetching.
 */
export function useServerNow(serverTime: string | undefined, tickMs: number): number {
  const offset = useRef(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!serverTime) return
    offset.current = new Date(serverTime).getTime() - Date.now()
    setNow(Date.now() + offset.current)
  }, [serverTime])
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offset.current), tickMs)
    return () => window.clearInterval(id)
  }, [tickMs])
  return now
}
