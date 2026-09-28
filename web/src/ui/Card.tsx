import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from './cn'

/** Surface with a hairline border everywhere; a soft shadow only in Light (via --elevation). */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { flat?: boolean }>(function Card(
  { className, flat, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('rounded-[var(--radius-lg)] border border-line bg-surface', !flat && 'shadow-card', className)}
      {...rest}
    />
  )
})
