import { Loader2, type LucideIcon } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-on-ink hover:brightness-110',
  accent: 'bg-accent text-on-accent hover:brightness-110',
  secondary: 'bg-surface text-fg border border-line-strong hover:bg-[var(--hover-overlay)]',
  danger: 'bg-danger-soft text-danger hover:brightness-95',
  ghost: 'bg-transparent text-fg hover:bg-[var(--hover-overlay)]',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 gap-1.5 text-[13px]',
  md: 'h-11 px-[18px] gap-2',
  lg: 'h-13 px-[22px] gap-2',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
  trailing?: ReactNode
}

/**
 * The one button. While `loading` it keeps its size, shows a spinner, announces "Working"
 * and ignores clicks — which is what stops a double click sending an order twice.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, loading = false, trailing, className, children, disabled, type = 'button', onClick, ...rest },
  ref,
) {
  const inactive = disabled || loading
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={inactive || undefined}
      onClick={loading ? undefined : onClick}
      className={cn(
        't-button relative inline-flex items-center justify-center rounded-[var(--radius-md)] whitespace-nowrap select-none',
        'transition-[transform,filter,background-color] duration-150 ease-[var(--ease-standard)] active:scale-[0.97]',
        'disabled:bg-sunken disabled:text-fg-disabled disabled:border-transparent disabled:active:scale-100 disabled:hover:brightness-100',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      <span className={cn('inline-flex min-w-0 items-center gap-[inherit]', loading && 'invisible')}>
        {Icon && <Icon aria-hidden className="size-[18px] shrink-0" />}
        <span className="truncate">{children}</span>
        {trailing !== undefined && <span className="opacity-75">{trailing}</span>}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 aria-hidden className="size-5 animate-spin" />
          <span className="sr-only">Working</span>
        </span>
      )}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  tone?: 'default' | 'danger'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, tone = 'default', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-[transform,background-color] duration-150',
        'hover:bg-[var(--hover-overlay)] active:scale-90 disabled:text-fg-disabled disabled:hover:bg-transparent',
        tone === 'danger' ? 'text-danger' : 'text-fg',
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  )
})
