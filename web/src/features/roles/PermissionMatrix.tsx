import { Lock, ShieldAlert } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/ui/cn'
import { Checkbox, Notice } from '@/features/staff/manage-kit'
import { selectAllState, toggleGroup, type PermissionCell, type PermissionGroup } from './matrix'

const LOCKED = "You can't grant access you don't have"

interface HasCode {
  has: (code: string) => boolean
}

/**
 * Permissions as a matrix: one row per group, one cell per action. Cells the actor can't
 * grant are locked with the reason; sensitive ones carry a warning mark.
 */
export function PermissionMatrix({ groups, selected, editable, grants, onChange }: {
  groups: readonly PermissionGroup[]
  selected: ReadonlySet<string>
  editable: boolean
  grants: HasCode
  onChange: (next: Set<string>) => void
}) {
  const anyLocked = editable && groups.some((g) => g.cells.some((c) => !grants.has(c.code)))
  return (
    <section aria-labelledby="perm-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 id="perm-heading" className="t-section text-fg">Permissions</h2>
          <p className="t-support text-fg2">{selected.size} on. Changes apply to everyone with this role on their next action.</p>
        </div>
        <p className="t-meta flex items-center gap-1.5 text-fg2">
          <ShieldAlert aria-hidden className="size-4 text-warning" />
          Sensitive: controls people, roles, money or settings
        </p>
      </div>
      {anyLocked && <Notice icon={Lock}>Locked permissions are ones you don't hold. You can't grant access you don't have.</Notice>}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-card">
        {groups.map((g) => (
          <GroupRow key={g.group} group={g} selected={selected} editable={editable} grants={grants} onChange={onChange} />
        ))}
      </div>
    </section>
  )
}

function GroupRow({ group, selected, editable, grants, onChange }: {
  group: PermissionGroup
  selected: ReadonlySet<string>
  editable: boolean
  grants: HasCode
  onChange: (next: Set<string>) => void
}) {
  const headingId = useId()
  const codes = group.cells.map((c) => c.code)
  const count = codes.filter((c) => selected.has(c)).length
  const state = selectAllState(codes, selected, grants)
  const grantable = codes.some((c) => grants.has(c))
  return (
    <div role="group" aria-labelledby={headingId} className="grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[200px_minmax(0,1fr)] md:gap-5 md:p-5">
      <div className="flex items-start gap-3">
        {editable && (
          <Checkbox
            className="mt-0.5"
            checked={state}
            disabled={!grantable}
            label={`Select all ${group.group} permissions`}
            onChange={() => onChange(toggleGroup(codes, selected, grants, state !== true))}
          />
        )}
        <div className="min-w-0">
          <h3 id={headingId} className="t-card-title text-fg">{group.group}</h3>
          <p className="t-meta text-fg3">{count} of {codes.length} on</p>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
        {group.cells.map((cell) => (
          <Cell
            key={cell.code}
            group={group.group}
            cell={cell}
            checked={selected.has(cell.code)}
            editable={editable}
            grantable={grants.has(cell.code)}
            onToggle={(on) => {
              const next = new Set(selected)
              if (on) next.add(cell.code)
              else next.delete(cell.code)
              onChange(next)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function Cell({ group, cell, checked, editable, grantable, onToggle }: {
  group: string
  cell: PermissionCell
  checked: boolean
  editable: boolean
  grantable: boolean
  onToggle: (on: boolean) => void
}) {
  const id = useId()
  const enabled = editable && grantable
  const locked = editable && !grantable
  return (
    <label
      htmlFor={id}
      title={locked ? LOCKED : cell.description}
      className={cn(
        'flex min-h-[64px] items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors duration-150',
        checked ? 'border-line-strong bg-sunken' : 'border-line bg-surface',
        enabled ? 'cursor-pointer hover:border-line-strong' : 'cursor-default',
      )}
    >
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={checked}
        disabled={!enabled}
        // "Orders – Cancel", not just "Cancel": several groups share the same action names.
        label={`${group} – ${cell.label}`}
        describedBy={`${id}-d`}
        onChange={onToggle}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('t-body-strong flex items-center gap-1.5 text-[14px] leading-5', enabled || checked ? 'text-fg' : 'text-fg2')}>
          {cell.label}
          {cell.dangerous && (
            <span className="inline-flex text-warning" title="Sensitive permission">
              <ShieldAlert aria-hidden className="size-3.5" />
            </span>
          )}
        </span>
        <span id={`${id}-d`} className="t-meta mt-0.5 block text-fg3">
          {cell.description}
          {cell.dangerous && <span className="sr-only">. Sensitive permission</span>}
          {locked && (
            <span className="mt-1 flex items-center gap-1 text-fg2">
              <Lock aria-hidden className="size-3" />
              {LOCKED}
            </span>
          )}
        </span>
      </span>
    </label>
  )
}
