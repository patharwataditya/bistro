import type { LucideIcon } from 'lucide-react'
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from './cn'

interface FieldShellProps {
  label: string
  error?: string | null
  hint?: ReactNode
  id: string
  children: ReactNode
  className?: string
  hideLabel?: boolean
}

/** Label above, control, then an error (announced) or a hint. */
export function FieldShell({ label, error, hint, id, children, className, hideLabel }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('t-meta text-fg2', hideLabel && 'sr-only')}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="t-meta text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="t-meta text-fg3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

const control = cn(
  't-body w-full rounded-[var(--radius-md)] border bg-surface text-fg placeholder:text-fg3',
  'transition-[border-color,box-shadow] duration-150 outline-none',
  'focus:border-fg focus-visible:shadow-none disabled:bg-sunken disabled:text-fg-disabled',
)

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  error?: string | null
  hint?: ReactNode
  icon?: LucideIcon
  prefix?: string
  hideLabel?: boolean
  wrapperClassName?: string
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, icon: Icon, prefix, hideLabel, wrapperClassName, className, id, type = 'text', ...rest },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  return (
    <FieldShell label={label} error={error} hint={hint} id={fieldId} className={wrapperClassName} hideLabel={hideLabel}>
      <div className="relative">
        {Icon && <Icon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-fg3" />}
        {prefix && <span aria-hidden className="t-body pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg2">{prefix}</span>}
        <input
          ref={ref}
          id={fieldId}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
          className={cn(
            control,
            'h-12 px-3.5',
            (Icon || prefix) && 'pl-10',
            isPassword && 'pr-11',
            error ? 'border-danger' : 'border-line-strong',
            className,
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            className="absolute top-1/2 right-1.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-fg2 hover:bg-[var(--hover-overlay)]"
          >
            {revealed ? <EyeOff aria-hidden className="size-[18px]" /> : <Eye aria-hidden className="size-[18px]" />}
          </button>
        )}
      </div>
    </FieldShell>
  )
})

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string | null
  hint?: ReactNode
  wrapperClassName?: string
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, error, hint, id, className, wrapperClassName, rows = 3, ...rest },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell label={label} error={error} hint={hint} id={fieldId} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
        className={cn(control, 'resize-y px-3.5 py-3', error ? 'border-danger' : 'border-line-strong', className)}
        {...rest}
      />
    </FieldShell>
  )
})

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string | null
  hint?: ReactNode
  wrapperClassName?: string
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, error, hint, id, className, wrapperClassName, children, ...rest },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell label={label} error={error} hint={hint} id={fieldId} className={wrapperClassName}>
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(control, 'h-12 appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat px-3.5 pr-10', error ? 'border-danger' : 'border-line-strong', className)}
        style={{ backgroundImage: 'var(--chevron)' }}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  )
})
