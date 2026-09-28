import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from './cn'

type Kind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: Kind; text: string }

interface ToastApi {
  success: (text: string) => void
  error: (text: string) => void
  info: (text: string) => void
}

const Ctx = createContext<ToastApi | null>(null)

/**
 * Action feedback. Successes are brief and polite; errors stay longer, are assertive, and can
 * be dismissed — so a failure is never missed while the user looks at the next thing.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback((kind: Kind, text: string) => {
    const id = ++seq.current
    setToasts((t) => [...t.slice(-2), { id, kind, text }])
    const ms = kind === 'error' ? 7000 : text.length > 60 ? 4200 : 2800
    window.setTimeout(() => dismiss(id), ms)
  }, [dismiss])
  const api = useMemo<ToastApi>(() => ({
    success: (t) => push('success', t),
    error: (t) => push('error', t),
    info: (t) => push('info', t),
  }), [push])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-6 bottom-6 z-[60] flex w-[min(420px,calc(100vw-32px))] flex-col items-end gap-2">
        <div aria-live="polite" className="sr-only">{toasts.filter((t) => t.kind !== 'error').map((t) => t.text).join('. ')}</div>
        <div aria-live="assertive" className="sr-only">{toasts.filter((t) => t.kind === 'error').map((t) => t.text).join('. ')}</div>
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? CircleAlert : Info
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
                transition={{ duration: 0.24, ease: [0.05, 0.7, 0.1, 1] }}
                className="pointer-events-auto flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-line-strong bg-ink px-4 py-3 text-on-ink shadow-float"
              >
                <Icon aria-hidden className={cn('size-5 shrink-0', t.kind === 'success' ? 'text-success' : t.kind === 'error' ? 'text-danger' : 'text-info')} />
                <span className="t-body-strong min-w-0 flex-1">{t.text}</span>
                <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="-mr-1 inline-flex size-8 items-center justify-center rounded-full opacity-70 hover:opacity-100">
                  <X aria-hidden className="size-4" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast outside ToastProvider')
  return ctx
}
