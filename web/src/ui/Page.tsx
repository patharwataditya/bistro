import type { ReactNode } from 'react'
import { cn } from './cn'

/** Page header: eyebrow, title, subtitle and actions. The page title is the h1. */
export function PageHeader({ title, eyebrow, subtitle, actions, className }: { title: ReactNode; eyebrow?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex flex-wrap items-end gap-x-6 gap-y-3 pb-5', className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="t-status text-fg3">{eyebrow}</p>}
        <h1 className="t-page-title truncate text-fg">{title}</h1>
        {subtitle && <p className="t-support mt-0.5 text-fg2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Section({ title, subtitle, action, children, className }: { title: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="t-section text-fg">{title}</h2>
          {subtitle && <p className="t-support text-fg2">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Label-left, amount-right line with tabular figures (money breakdowns). */
export function AmountLine({ label, amount, strong, tone }: { label: ReactNode; amount: ReactNode; strong?: boolean; tone?: 'success' | 'danger' }) {
  return (
    <div className="flex items-baseline gap-4 py-[3px]">
      <span className={cn('min-w-0 flex-1', strong ? 't-card-title text-fg' : 't-body text-fg2')}>{label}</span>
      <span className={cn(strong ? 't-amount-lg text-fg' : 't-amount', tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : !strong && 'text-fg')}>{amount}</span>
    </div>
  )
}
