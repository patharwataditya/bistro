/**
 * Building blocks shared by the management screens (Menu, Tables & areas, Staff, Roles,
 * Settings). Feature-local on purpose: these patterns belong to management pages only.
 */
import { Check, Lock, Minus, Search, X, type LucideIcon } from 'lucide-react'
import { Checkbox as RCheckbox } from 'radix-ui'
import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useBlocker } from 'react-router'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '@/api/errors'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { ConfirmDialog } from '@/ui/Overlay'
import { Skeleton } from '@/ui/States'
import { TONE, type Tone } from '@/ui/tone'

/* ------------------------------------------------------------------ notices */

/** An explanation block: why something is locked, or what a change will do. */
export function Notice({ children, icon: Icon = Lock, tone = 'neutral', className, live }: {
  children: ReactNode
  icon?: LucideIcon
  tone?: Tone
  className?: string
  /** Announce changes politely (for reasons that appear after an action). */
  live?: boolean
}) {
  return (
    <div
      role={live ? 'status' : undefined}
      className={cn('flex items-start gap-2.5 rounded-[var(--radius-md)] px-3.5 py-3', TONE[tone].bg, className)}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', TONE[tone].fg)} />
      <div className="t-support min-w-0 flex-1 text-fg">{children}</div>
    </div>
  )
}

/** One-line reason under a disabled control. */
export function LockNote({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <p id={id} className={cn('t-meta flex items-center gap-1.5 text-fg3', className)}>
      <Lock aria-hidden className="size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/* ------------------------------------------------------------------ toolbar */

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex flex-wrap items-center gap-3', className)}>{children}</div>
}

export function SearchInput({ value, onChange, placeholder, label, className, maxLength = 60 }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
  className?: string
  maxLength?: number
}) {
  return (
    <div className={cn('relative min-w-[220px] flex-1 sm:max-w-[360px]', className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-fg3" />
      <input
        type="search"
        value={value}
        maxLength={maxLength}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation()
            onChange('')
          }
        }}
        className="t-body h-11 w-full rounded-[var(--radius-md)] border border-line-strong bg-surface pr-10 pl-10 text-fg outline-none placeholder:text-fg3 focus:border-fg [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-fg2 hover:bg-[var(--hover-overlay)]"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ people */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? [parts[0]?.[0], parts[parts.length - 1]?.[0]] : [parts[0]?.[0], parts[0]?.[1]]
  return letters.filter(Boolean).join('').toUpperCase() || '?'
}

export function Avatar({ name, muted, size = 36 }: { name: string; muted?: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold',
        muted ? 'bg-sunken text-fg3' : 'bg-accent-soft text-accent',
      )}
    >
      {initials(name)}
    </span>
  )
}

/* ------------------------------------------------------------------ checkbox */

export type CheckState = boolean | 'indeterminate'

/** Accessible (tri-state) checkbox. The label is required; hide it visually with `srLabel`. */
export function Checkbox({ checked, onChange, disabled, label, id, describedBy, className }: {
  checked: CheckState
  onChange: (v: boolean) => void
  disabled?: boolean
  label: string
  id?: string
  describedBy?: string
  className?: string
}) {
  return (
    <RCheckbox.Root
      id={id}
      checked={checked}
      disabled={disabled}
      aria-label={label}
      aria-describedby={describedBy}
      onCheckedChange={(v) => onChange(v === true)}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] transition-colors duration-150',
        'border-line-strong bg-surface data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=indeterminate]:border-ink data-[state=indeterminate]:bg-ink',
        'disabled:cursor-not-allowed disabled:border-line disabled:bg-sunken disabled:data-[state=checked]:border-fg-disabled disabled:data-[state=checked]:bg-fg-disabled',
        className,
      )}
    >
      <RCheckbox.Indicator className="text-on-ink">
        {checked === 'indeterminate' ? <Minus aria-hidden className="size-3.5" strokeWidth={3} /> : <Check aria-hidden className="size-3.5" strokeWidth={3} />}
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  )
}

/* ------------------------------------------------------------------ table rows */

/**
 * Keyboard access for clickable DataTable rows: rows are focusable, Enter/Space opens,
 * ArrowUp/ArrowDown move between rows (roving within the same tbody).
 */
export function rowProps(onOpen: () => void, label: string) {
  return {
    tabIndex: 0,
    'aria-label': label,
    onClick: onOpen,
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        // Skip non-focusable rows (group headers) on the way.
        const step = (el: Element | null) => (e.key === 'ArrowDown' ? el?.nextElementSibling : el?.previousElementSibling) ?? null
        let sib = step(e.currentTarget)
        while (sib && !(sib instanceof HTMLElement && sib.tabIndex >= 0)) sib = step(sib)
        if (sib instanceof HTMLElement) sib.focus()
      }
    },
    className: 'cursor-pointer outline-none transition-colors hover:bg-sunken/60 focus-visible:bg-sunken/60 focus-visible:shadow-[inset_3px_0_0_var(--accent)]',
  }
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading" className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
      <div className="flex gap-6 border-b border-line px-4 py-3">
        {Array.from({ length: cols }, (_, i) => <Skeleton key={i} className="h-3 w-20 rounded-[var(--radius-xs)]" />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 border-b border-line px-4 py-3.5 last:border-b-0">
          {Array.from({ length: cols }, (_, i) => <Skeleton key={i} className={cn('h-4 rounded-[var(--radius-xs)]', i === 0 ? 'w-48' : 'w-24')} />)}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ forms */

/** Server messages sometimes carry pydantic's prefix; staff never need to see it. */
export function cleanMessage(msg: string): string {
  return msg.replace(/^Value error, /, '')
}

/**
 * Puts server field errors next to their inputs. Returns what couldn't be placed (a general
 * message to show above the form), or null when every error landed on a field.
 * `aliases` maps server field names to form field names (e.g. { role_ids: 'roleIds' }).
 * A 409 CONFLICT with no fields is attached to `conflictField` (usually the name).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  opts: { aliases?: Record<string, Path<T>>; conflictField?: Path<T> } = {},
): string | null {
  if (!(error instanceof ApiError)) return 'Something unexpected happened. Try again.'
  let placed = false
  const leftovers: string[] = []
  for (const [serverField, msg] of Object.entries(error.fields)) {
    const target = opts.aliases?.[serverField] ?? (fields.includes(serverField as Path<T>) ? (serverField as Path<T>) : undefined)
    if (target) {
      setError(target, { type: 'server', message: cleanMessage(msg) }, { shouldFocus: !placed })
      placed = true
    } else {
      leftovers.push(cleanMessage(msg))
    }
  }
  if (!placed && error.kind === 'conflict' && opts.conflictField) {
    setError(opts.conflictField, { type: 'server', message: error.message }, { shouldFocus: true })
    return null
  }
  if (placed && leftovers.length === 0) return null
  return leftovers.length ? leftovers.join(' ') : error.message
}

/** Password strength exactly as the server checks it (schemas/auth.py). */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return `At least 8 characters (${8 - password.length} more)`
  if (password.length > 128) return 'At most 128 characters'
  if (password.trim() !== password) return "Can't start or end with a space"
  if (/^\d+$/.test(password) || /^\p{L}+$/u.test(password)) return 'Mix letters with numbers or symbols'
  return null
}

export const PASSWORD_HINT = 'At least 8 characters, mixing letters with numbers or symbols'

/* ------------------------------------------------------------------ unsaved changes */

/**
 * Blocks in-app navigation and tab close while `dirty`, asking before edits are lost.
 * Render the returned element once on the page.
 */
export function useUnsavedGuard(dirty: boolean): ReactNode {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(o) => {
        if (!o && blocker.state === 'blocked') blocker.reset()
      }}
      title="Discard changes?"
      message="Your edits haven't been saved."
      confirmLabel="Discard"
      destructive
      onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
    />
  )
}

/**
 * For drawers holding a form: closing with unsaved edits asks first.
 * `request(close)` runs `close` immediately when clean, otherwise after confirmation.
 */
export function useDiscardConfirm(dirty: boolean) {
  const [pending, setPending] = useState<(() => void) | null>(null)
  const request = useCallback((close: () => void) => {
    if (dirty) setPending(() => close)
    else close()
  }, [dirty])
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(o) => !o && setPending(null)}
      title="Discard changes?"
      message="Your edits haven't been saved."
      confirmLabel="Discard"
      destructive
      onConfirm={() => {
        const fn = pending
        setPending(null)
        fn?.()
      }}
    />
  )
  return { request, dialog }
}

/** Pinned footer inside a drawer: secondary : primary = 1 : 1.4. */
export function DrawerActions({ secondary, primary }: { secondary?: ReactNode; primary: ReactNode }) {
  return (
    <div className="flex gap-3">
      {secondary && <div className="flex flex-[1] [&>*]:w-full">{secondary}</div>}
      <div className="flex flex-[1.4] [&>*]:w-full">{primary}</div>
    </div>
  )
}

/** A heading for groups inside drawers and cards. */
export function GroupLabel({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mt-5 mb-2 flex items-center gap-3 first:mt-1">
      <h3 id={id} className="t-status flex-1 text-fg3">{children}</h3>
      {action}
    </div>
  )
}

/** Label/value line in detail drawers. */
export function DetailLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-1.5">
      <dt className="t-support w-28 shrink-0 text-fg3">{label}</dt>
      <dd className="t-body min-w-0 flex-1 text-fg">{children}</dd>
    </div>
  )
}

/** Sticky save bar shown only while there are unsaved edits. */
export function SaveBar({ dirty, saving, onSave, onDiscard, message, canSave = true, saveLabel = 'Save changes' }: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  message?: ReactNode
  canSave?: boolean
  saveLabel?: string
}) {
  if (!dirty) return null
  return (
    <div className="sticky bottom-4 z-10 mt-6">
      <div role="region" aria-label="Unsaved changes" className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-line-strong bg-raised px-4 py-3 shadow-float">
        <span className="t-body-strong min-w-0 flex-1 text-fg">{message ?? 'Unsaved changes'}</span>
        <Button variant="ghost" onClick={onDiscard} disabled={saving}>Discard</Button>
        <Button variant="accent" onClick={onSave} loading={saving} disabled={!canSave}>{saveLabel}</Button>
      </div>
    </div>
  )
}
