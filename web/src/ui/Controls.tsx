import { Minus, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { Switch as RSwitch } from 'radix-ui'
import { useId, type ReactNode } from 'react'
import { cn } from './cn'
import { CountBadge } from './Chip'

/** Segmented control with a sliding indicator (appearance, kitchen lanes, filters). */
export function Segmented<T extends string>({
  options, value, onChange, label, badge, className, ariaLabel,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label: (v: T) => string
  badge?: (v: T) => number | null
  className?: string
  ariaLabel: string
}) {
  const layoutId = useId()
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('flex h-11 rounded-[var(--radius-md)] bg-sunken p-[3px]', className)}>
      {options.map((o) => {
        const selected = o === value
        const count = badge?.(o) ?? null
        return (
          <button
            key={o}
            role="tab"
            aria-selected={selected}
            onClick={() => !selected && onChange(o)}
            className={cn('relative flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-[13px] font-semibold whitespace-nowrap transition-colors',
              selected ? 'text-fg' : 'text-fg2 hover:text-fg')}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                className="absolute inset-0 rounded-[var(--radius-sm)] border border-line bg-surface shadow-card"
              />
            )}
            <span className="relative">{label(o)}</span>
            {count !== null && count > 0 && (
              <span className="relative">
                <CountBadge count={count} tone={selected ? 'accent' : 'neutral'} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Filter chips (areas, categories, log filters). */
export function ChipRow<T>({ options, value, onChange, label, keyOf, ariaLabel, className }: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label: (v: T) => string
  keyOf: (v: T) => string
  ariaLabel: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex gap-2 overflow-x-auto pb-1', className)}>
      {options.map((o) => {
        const selected = keyOf(o) === keyOf(value)
        return (
          <button
            key={keyOf(o)}
            role="radio"
            aria-checked={selected}
            onClick={() => !selected && onChange(o)}
            className={cn('h-10 shrink-0 rounded-full px-4 text-[13px] font-semibold transition-[background-color,color,transform] duration-150 active:scale-95',
              selected ? 'bg-ink text-on-ink' : 'border border-line bg-surface text-fg hover:bg-[var(--hover-overlay)]')}
          >
            {label(o)}
          </button>
        )
      })}
    </div>
  )
}

/** Quantity stepper; the number rolls in the direction of change. */
export function Stepper({ value, onChange, min = 0, max = 999, label, compact }: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  label: string
  compact?: boolean
}) {
  const size = compact ? 'size-9' : 'size-11'
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-full bg-sunken p-[3px]">
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}
        className={cn(size, 'inline-flex items-center justify-center rounded-full bg-surface text-fg transition-transform active:scale-90 disabled:bg-transparent disabled:text-fg-disabled')}>
        <Minus aria-hidden className="size-4" />
      </button>
      <span aria-live="polite" className={cn('t-amount text-center tabular-nums', compact ? 'w-8' : 'w-10')}>{value}</span>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}
        className={cn(size, 'inline-flex items-center justify-center rounded-full bg-surface text-fg transition-transform active:scale-90 disabled:bg-transparent disabled:text-fg-disabled')}>
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line-strong bg-sunken transition-colors data-[state=checked]:border-transparent data-[state=checked]:bg-success disabled:opacity-50"
    >
      <RSwitch.Thumb className="block size-5 translate-x-1 rounded-full bg-surface shadow transition-transform duration-150 data-[state=checked]:translate-x-6" />
    </RSwitch.Root>
  )
}

/** A labelled switch row for settings lists. */
export function ToggleRow({ title, subtitle, checked, onChange, disabled }: { title: string; subtitle?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="t-body-strong text-fg">{title}</div>
        {subtitle && <div className="t-support text-fg2">{subtitle}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  )
}
