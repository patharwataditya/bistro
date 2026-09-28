import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { cn } from '@/ui/cn'

function numeric(text: string): number | null {
  const n = Number.parseFloat(text.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * A value that rolls vertically in the direction of change (Android's AnimatedCounter). The
 * first render doesn't animate, and reduced motion turns it into an instant swap.
 */
export function RollingValue({ value, className }: { value: string; className?: string }) {
  const [last, setLast] = useState({ value, dir: 1 })
  let dir = last.dir
  if (last.value !== value) {
    const a = numeric(last.value)
    const b = numeric(value)
    dir = a !== null && b !== null && b < a ? -1 : 1
    setLast({ value, dir })
  }
  return (
    <span className={cn('relative inline-flex overflow-hidden', className)}>
      <AnimatePresence initial={false} mode="popLayout" custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          variants={{
            enter: (d: number) => ({ y: `${45 * d}%`, opacity: 0 }),
            center: { y: 0, opacity: 1 },
            exit: (d: number) => ({ y: `${-45 * d}%`, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
          className="inline-block whitespace-nowrap"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
