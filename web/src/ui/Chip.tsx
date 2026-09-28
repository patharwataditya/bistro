import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'
import { TONE, type Tone } from './tone'

/** Status label: icon + word + tone. Never colour alone. */
export function StatusChip({ label, tone, icon: Icon, className }: { label: string; tone: Tone; icon?: LucideIcon; className?: string }) {
  const t = TONE[tone]
  return (
    <span className={cn('t-status inline-flex max-w-full items-center gap-[5px] rounded-full px-2.5 py-[5px] whitespace-nowrap', t.bg, t.fg, className)}>
      {Icon ? <Icon aria-hidden className="size-[13px] shrink-0" /> : <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      <span className="truncate">{label}</span>
    </span>
  )
}

export function CountBadge({ count, tone = 'accent' }: { count: number; tone?: Tone }) {
  return (
    <span className={cn('t-status inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 normal-case tracking-normal', TONE[tone].solid)}>
      {count}
    </span>
  )
}

export function MiniFlag({ text, tone }: { text: string; tone: Tone }) {
  return <span className={cn('t-meta rounded-[var(--radius-xs)] px-1.5 py-0.5 font-semibold', TONE[tone].bg, TONE[tone].fg)}>{text}</span>
}
