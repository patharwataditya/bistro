import { useId } from 'react'
import { useMe } from '@/auth/session'
import { cn } from '@/ui/cn'
import { Checkbox } from './manage-kit'
import { assignable, type RoleOption } from './roleAssign'

const LOCKED = "Includes access you don't have"

/**
 * Multi-select of roles. Roles carrying access the actor lacks are shown but locked, so the
 * choice is explained up front instead of being refused by the server.
 */
export function RolePicker({ options, value, onChange, disabled, error, labelledBy }: {
  options: readonly (RoleOption & { description?: string | null })[]
  value: readonly number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
  error?: string | null
  labelledBy?: string
}) {
  const { grants } = useMe()
  const errId = useId()
  const anyLocked = options.some((o) => !assignable(o.permissions, grants))
  return (
    <div>
      <div
        role="group"
        aria-labelledby={labelledBy}
        aria-describedby={error ? errId : undefined}
        className={cn('overflow-hidden rounded-[var(--radius-md)] border', error ? 'border-danger' : 'border-line')}
      >
        {options.map((role) => {
          const ok = assignable(role.permissions, grants)
          const checked = value.includes(role.id)
          const id = `${errId}-r${role.id}`
          const noteId = `${id}-note`
          const inactive = disabled || (!ok && !checked)
          return (
            <label
              key={role.id}
              htmlFor={id}
              className={cn(
                'flex min-h-12 items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0',
                inactive ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-overlay)]',
              )}
            >
              <Checkbox
                id={id}
                checked={checked}
                disabled={inactive || (!ok && checked)}
                label={role.name}
                describedBy={!ok ? noteId : undefined}
                onChange={(on) => onChange(on ? [...value, role.id] : value.filter((v) => v !== role.id))}
              />
              <span className="min-w-0 flex-1">
                <span className={cn('t-body-strong block', inactive && !checked ? 'text-fg-disabled' : 'text-fg')}>{role.name}</span>
                {!ok ? (
                  <span id={noteId} className="t-meta block text-fg3">{LOCKED}</span>
                ) : role.description ? (
                  <span className="t-meta block truncate text-fg3">{role.description}</span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
      {error ? (
        <p id={errId} role="alert" className="t-meta mt-1.5 text-danger">{error}</p>
      ) : anyLocked ? (
        <p className="t-meta mt-1.5 text-fg3">Locked roles include access you don't have, so you can't assign them.</p>
      ) : null}
    </div>
  )
}
