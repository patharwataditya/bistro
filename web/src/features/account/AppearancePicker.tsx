import { Check } from 'lucide-react'
import { APPEARANCES, APPEARANCE_LABEL, setAppearance, useAppearance, type Appearance } from '@/lib/appearance'
import { cn } from '@/ui/cn'

/**
 * Each tile previews its mode in that mode's own palette: the preview is wrapped in its own
 * `data-appearance`, so the design tokens resolve to that mode rather than the current one.
 */
export function AppearancePicker({ labelledBy }: { labelledBy: string }) {
  const current = useAppearance()
  const move = (from: Appearance, delta: number) => {
    const i = APPEARANCES.indexOf(from)
    const next = APPEARANCES[(i + delta + APPEARANCES.length) % APPEARANCES.length] ?? from
    setAppearance(next)
    document.getElementById(`appearance-${next}`)?.focus()
  }
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-3 gap-3">
      {APPEARANCES.map((mode) => {
        const selected = mode === current
        return (
          <button
            key={mode}
            id={`appearance-${mode}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setAppearance(mode)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(mode, 1) }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(mode, -1) }
            }}
            className={cn(
              'flex flex-col gap-2 rounded-[var(--radius-lg)] bg-surface p-2 text-left transition-[border-color,transform] duration-150 active:scale-[0.98]',
              selected ? 'border-2 border-accent' : 'border border-line p-[9px] hover:border-line-strong',
            )}
          >
            <span aria-hidden data-appearance={mode} className="flex h-[84px] flex-col gap-[5px] rounded-[var(--radius-md)] border border-line bg-bg p-2">
              <span className="h-2 w-3/5 rounded-full bg-fg" />
              <span className="flex flex-1 gap-[5px]">
                <span className="flex-1 rounded-[var(--radius-xs)] border border-line bg-surface" />
                <span className="flex-1 rounded-[var(--radius-xs)] border border-line bg-surface" />
              </span>
              <span className="h-2 w-2/5 rounded-full bg-accent" />
            </span>
            <span className="flex items-center justify-between px-1 pb-0.5">
              <span className="t-body-strong text-fg">{APPEARANCE_LABEL[mode]}</span>
              {selected && <Check aria-hidden className="size-4 text-accent" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
