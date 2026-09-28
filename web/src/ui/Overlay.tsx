import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog as RDialog } from 'radix-ui'
import { useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { cn } from './cn'

/**
 * Focus return for dialogs opened without a Radix Trigger (all of ours). Radix only returns
 * focus to its own Trigger, so without one focus fell to <body> on close. This remembers what
 * had focus when the dialog opened and puts focus back there, if it's still on the page.
 */
function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: () => {
      // Runs before Radix moves focus inside, so this is still the invoking element.
      const el = document.activeElement
      opener.current = el instanceof HTMLElement && el !== document.body ? el : null
    },
    onCloseAutoFocus: (e: Event) => {
      const el = opener.current
      opener.current = null
      if (el && el.isConnected) {
        e.preventDefault()
        el.focus({ preventScroll: true })
      }
    },
  }
}

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.16 } }

/**
 * Side panel — the web counterpart of Android's bottom sheets. While `busy` it can't be
 * dismissed (Escape / outside click / close), so a result is never hidden mid-request.
 */
export function Drawer({ open, onOpenChange, title, description, children, footer, busy, width = 480, onEscapeKeyDown }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  busy?: boolean
  width?: number
  /**
   * Runs on Escape before the drawer closes; call `e.preventDefault()` to keep it open (e.g.
   * to cancel an inline edit instead). Not called while `busy` (Escape is ignored then).
   */
  onEscapeKeyDown?: (e: KeyboardEvent) => void
}) {
  const focus = useReturnFocus()
  return (
    <RDialog.Root open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div {...fade} className="fixed inset-0 z-40 bg-scrim" />
            </RDialog.Overlay>
            <RDialog.Content
              asChild
              forceMount
              {...focus}
              onEscapeKeyDown={(e) => {
                if (busy) e.preventDefault()
                else onEscapeKeyDown?.(e)
              }}
              onPointerDownOutside={(e) => busy && e.preventDefault()}
            >
              <motion.div
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 40, opacity: 0 }}
                transition={{ duration: 0.26, ease: [0.05, 0.7, 0.1, 1] }}
                style={{ width: `min(${width}px, 100vw)` }}
                className="fixed top-0 right-0 bottom-0 z-50 flex flex-col border-l border-line bg-surface shadow-float"
              >
                <div className="flex items-start gap-3 px-6 pt-6 pb-3">
                  <div className="min-w-0 flex-1">
                    <RDialog.Title className="t-section text-fg">{title}</RDialog.Title>
                    {description ? (
                      <RDialog.Description className="t-support mt-0.5 text-fg2">{description}</RDialog.Description>
                    ) : (
                      <RDialog.Description className="sr-only">{title}</RDialog.Description>
                    )}
                  </div>
                  <RDialog.Close asChild>
                    <button aria-label="Close" disabled={busy} className="-mt-1 -mr-2 inline-flex size-10 items-center justify-center rounded-full text-fg2 hover:bg-[var(--hover-overlay)] disabled:opacity-40">
                      <X aria-hidden className="size-5" />
                    </button>
                  </RDialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">{children}</div>
                {footer && <div className="border-t border-line px-6 py-4">{footer}</div>}
              </motion.div>
            </RDialog.Content>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  )
}

/** Confirmation for consequential actions. Destructive ones use the danger style. */
export function ConfirmDialog({ open, onOpenChange, title, message, confirmLabel, onConfirm, destructive, loading, confirmDisabled, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
  destructive?: boolean
  loading?: boolean
  confirmDisabled?: boolean
  children?: ReactNode
}) {
  const focus = useReturnFocus()
  return (
    <RDialog.Root open={open} onOpenChange={(o) => (loading ? undefined : onOpenChange(o))}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div {...fade} className="fixed inset-0 z-40 bg-scrim" />
            </RDialog.Overlay>
            <RDialog.Content asChild forceMount role="alertdialog" {...focus} onEscapeKeyDown={(e) => loading && e.preventDefault()} onPointerDownOutside={(e) => loading && e.preventDefault()}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.05, 0.7, 0.1, 1] }}
                className="fixed top-1/2 left-1/2 z-50 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-xl)] border border-line bg-surface p-6 shadow-float"
              >
                <RDialog.Title className="t-section text-fg">{title}</RDialog.Title>
                <RDialog.Description className="t-body mt-2 text-fg2">{message}</RDialog.Description>
                {children && <div className="mt-4 flex flex-col gap-3">{children}</div>}
                <div className="mt-6 flex justify-end gap-2">
                  <RDialog.Close asChild>
                    <Button variant="ghost" disabled={loading}>Cancel</Button>
                  </RDialog.Close>
                  <Button variant={destructive ? 'danger' : 'primary'} loading={loading} disabled={confirmDisabled} onClick={onConfirm}>
                    {confirmLabel}
                  </Button>
                </div>
              </motion.div>
            </RDialog.Content>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full bg-line', className)} />
}
