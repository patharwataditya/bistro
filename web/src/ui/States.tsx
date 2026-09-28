import { CircleAlert, CloudOff, Lock, SearchX, WifiOff, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ApiError } from '@/api/errors'
import { Button } from './Button'
import { cn } from './cn'

export function EmptyState({ icon: Icon, title, message, action, className }: { icon: LucideIcon; title: string; message: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-8 py-14 text-center', className)}>
      <div className="flex size-[72px] items-center justify-center rounded-[var(--radius-xl)] bg-sunken">
        <Icon aria-hidden className="size-8 text-fg3" />
      </div>
      <h2 className="t-card-title mt-4 text-fg">{title}</h2>
      <p className="t-support mt-1 max-w-sm text-fg2">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Full-area error with a specific explanation and, when it helps, a retry. */
export function ErrorState({ error, onRetry, className }: { error: ApiError | Error; onRetry?: () => void; className?: string }) {
  const kind = 'kind' in error ? (error as ApiError).kind : 'unexpected'
  const [icon, title]: [LucideIcon, string] =
    kind === 'offline' ? [WifiOff, 'No connection']
    : kind === 'timeout' ? [CloudOff, 'Server not responding']
    : kind === 'forbidden' ? [Lock, 'Not available to you']
    : kind === 'not-found' ? [SearchX, 'Not found']
    : [CircleAlert, "Couldn't load this"]
  const retryable = 'retryable' in error ? (error as ApiError).retryable : true
  return (
    <div role="alert">
      <EmptyState
        icon={icon}
        title={title}
        message={error.message}
        className={className}
        action={onRetry && retryable ? <Button variant="secondary" onClick={onRetry}>Try again</Button> : undefined}
      />
    </div>
  )
}

/** Shown above data that is still displayed but could not be refreshed. */
export function StaleBanner({ error, className }: { error: ApiError | Error | null | undefined; className?: string }) {
  if (!error) return null
  const offline = 'kind' in error && (error as ApiError).kind === 'offline'
  return (
    <div role="status" className={cn('flex items-center gap-2 rounded-[var(--radius-md)] bg-warning-soft px-3 py-2 text-warning', className)}>
      <WifiOff aria-hidden className="size-4 shrink-0" />
      <span className="t-meta">{offline ? 'Offline — showing the last update. Reconnecting…' : "Couldn't refresh — showing the last update. Retrying…"}</span>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-[var(--radius-md)]', className)} />
}

export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-[72px] w-full" />)}
    </div>
  )
}
