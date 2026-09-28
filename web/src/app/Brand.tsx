/** The cloche mark (same paths as the Android launcher icon). */
export function BrandMark({ size = 36, framed = true }: { size?: number; framed?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" aria-hidden role="img" className="shrink-0">
      {framed && <rect width="108" height="108" rx="26" fill="#1C1712" />}
      <path fill="#E0703C" d="M54 36c-11.6 0-21 8.9-21 20.5V60h42v-3.5C75 44.9 65.6 36 54 36z" />
      <path fill="#E0703C" d="M50.5 30.5h7a2 2 0 0 1 2 2V34a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1.5a2 2 0 0 1 2-2z" />
      <path fill="#E0703C" d="M29 63h50a2.5 2.5 0 0 1 0 5H29a2.5 2.5 0 0 1 0-5z" />
    </svg>
  )
}
