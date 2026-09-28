import { AnimatePresence, motion } from 'motion/react'
import { Dialog as RDialog } from 'radix-ui'
import type { FormEvent, ReactNode } from 'react'
import { Button, type ButtonVariant } from '@/ui/Button'

/**
 * A small centred form dialog (note, guests, add-with-note). Focus is trapped by Radix;
 * Enter submits; while `loading` it can't be dismissed, so a result is never hidden.
 */
export function FormDialog({
  open, onOpenChange, title, description, children, submitLabel, onSubmit, loading, submitDisabled,
  submitVariant = 'primary', secondary,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  submitLabel: ReactNode
  onSubmit: () => void
  loading?: boolean
  submitDisabled?: boolean
  submitVariant?: ButtonVariant
  /** An extra action on the left of the footer (e.g. "Remove item"). */
  secondary?: ReactNode
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!loading && !submitDisabled) onSubmit()
  }
  return (
    <RDialog.Root open={open} onOpenChange={(o) => (loading ? undefined : onOpenChange(o))}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="fixed inset-0 z-40 bg-scrim" />
            </RDialog.Overlay>
            <RDialog.Content
              asChild
              forceMount
              onEscapeKeyDown={(e) => loading && e.preventDefault()}
              onPointerDownOutside={(e) => loading && e.preventDefault()}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.05, 0.7, 0.1, 1] }}
                className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-xl)] border border-line bg-surface p-6 shadow-float"
              >
                <form onSubmit={submit}>
                  <RDialog.Title className="t-section text-fg">{title}</RDialog.Title>
                  {description ? (
                    <RDialog.Description className="t-support mt-1 text-fg2">{description}</RDialog.Description>
                  ) : (
                    <RDialog.Description className="sr-only">{title}</RDialog.Description>
                  )}
                  <div className="mt-5 flex flex-col gap-4">{children}</div>
                  <div className="mt-6 flex items-center gap-2">
                    <div className="mr-auto">{secondary}</div>
                    <RDialog.Close asChild>
                      <Button variant="ghost" disabled={loading}>Cancel</Button>
                    </RDialog.Close>
                    <Button type="submit" variant={submitVariant} loading={loading} disabled={submitDisabled}>
                      {submitLabel}
                    </Button>
                  </div>
                </form>
              </motion.div>
            </RDialog.Content>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  )
}

/** Quick-note chips that append to a note field. */
export function QuickNotes({ notes, onPick }: { notes: readonly string[]; onPick: (note: string) => void }) {
  return (
    <div role="group" aria-label="Quick notes" className="flex flex-wrap gap-2">
      {notes.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          className="t-support h-9 rounded-full border border-line bg-surface px-3.5 text-fg transition-[background-color,transform] duration-150 hover:bg-[var(--hover-overlay)] active:scale-95"
        >
          {n}
        </button>
      ))}
    </div>
  )
}
