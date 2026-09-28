/**
 * The permission matrix behind the role editor, as pure functions so the rules that matter
 * (never offer access the actor lacks; send only what changed) are tested in isolation.
 */
import type { PermissionInfo, Role } from '@/api/types'

export interface PermissionCell {
  code: string
  /** "view", "manage_status" … */
  action: string
  /** "View", "Manage status" … */
  label: string
  description: string
  dangerous: boolean
}

export interface PermissionGroup {
  group: string
  cells: PermissionCell[]
}

interface HasCode {
  has: (code: string) => boolean
}

const DANGEROUS_EXACT = new Set(['billing.refund', 'billing.void', 'settings.update', 'orders.cancel'])

/** Permissions that hand out access or move money: flagged so they're granted deliberately. */
export function isDangerous(code: string): boolean {
  return code.startsWith('roles.') || code.startsWith('staff.') || DANGEROUS_EXACT.has(code)
}

export function humanize(action: string): string {
  const words = action.replace(/[._]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action
}

/** The order the app itself is laid out in (operations first, administration last). */
const GROUP_ORDER = ['Dashboard', 'Tables', 'Orders', 'Kitchen', 'Billing', 'Menu', 'Reports', 'Staff', 'Roles', 'Settings', 'Audit']
/** Reading order of actions inside a group: see, then add, change, special actions, remove. */
const ACTION_ORDER = ['view', 'create', 'update']

function rank(list: readonly string[], value: string): number {
  const i = list.indexOf(value)
  return i === -1 ? list.length : i
}

function actionRank(action: string): number {
  if (action === 'delete') return 99
  return rank(ACTION_ORDER, action)
}

/**
 * Groups in the app's own order (unknown groups from a newer server go last, in the order
 * they arrive); inside a group: view, create, update, other actions, delete.
 */
export function groupPermissions(perms: readonly PermissionInfo[]): PermissionGroup[] {
  const groups = new Map<string, PermissionCell[]>()
  for (const p of perms) {
    const action = p.code.includes('.') ? p.code.slice(p.code.indexOf('.') + 1) : p.code
    const cell: PermissionCell = { code: p.code, action, label: humanize(action), description: p.description, dangerous: isDangerous(p.code) }
    const list = groups.get(p.group)
    if (list) list.push(cell)
    else groups.set(p.group, [cell])
  }
  return [...groups.entries()]
    .map(([group, cells], index) => ({ group, cells: cells.map((c, i) => ({ c, i })).sort((a, b) => actionRank(a.c.action) - actionRank(b.c.action) || a.i - b.i).map((x) => x.c), index }))
    .sort((a, b) => rank(GROUP_ORDER, a.group) - rank(GROUP_ORDER, b.group) || a.index - b.index)
    .map(({ group, cells }) => ({ group, cells }))
}

/** Tri-state for a group's "select all", counted only over permissions the actor may grant. */
export function selectAllState(groupCodes: readonly string[], selected: ReadonlySet<string>, grants: HasCode): boolean | 'indeterminate' {
  const grantable = groupCodes.filter((c) => grants.has(c))
  const chosen = grantable.filter((c) => selected.has(c)).length
  if (grantable.length === 0 || chosen === 0) return false
  return chosen === grantable.length ? true : 'indeterminate'
}

/**
 * Turn a whole group on or off. Only grantable permissions change: a locked permission the
 * role already has stays as it is, and one it doesn't have is never added.
 */
export function toggleGroup(groupCodes: readonly string[], selected: ReadonlySet<string>, grants: HasCode, on: boolean): Set<string> {
  const next = new Set(selected)
  for (const code of groupCodes) {
    if (!grants.has(code)) continue
    if (on) next.add(code)
    else next.delete(code)
  }
  return next
}

export interface RoleForm {
  name: string
  description: string
  permissions: ReadonlySet<string>
}

export function formOf(role: Role | null | undefined): RoleForm {
  return { name: role?.name ?? '', description: role?.description ?? '', permissions: new Set(role?.permissions ?? []) }
}

export function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

export function formsEqual(a: RoleForm, b: RoleForm): boolean {
  return a.name === b.name && a.description === b.description && sameSet(a.permissions, b.permissions)
}

export interface RoleChanges {
  version: number
  name?: string
  description?: string
  permissions?: string[]
}

/** Only the fields that differ from the role the edit started from, plus its version. */
export function diffRole(role: Role, form: RoleForm): RoleChanges {
  const out: RoleChanges = { version: role.version }
  const name = form.name.trim()
  const description = form.description.trim()
  if (name !== role.name) out.name = name
  if (description !== (role.description ?? '')) out.description = description
  if (!sameSet(form.permissions, new Set(role.permissions))) out.permissions = [...form.permissions].sort()
  return out
}

/** Why a role can't be changed by this person, in the Android wording; null when it can. */
export function readOnlyReason(
  isNew: boolean,
  role: Role | null | undefined,
  actor: { can: (p: 'roles.create' | 'roles.update') => boolean; has: (code: string) => boolean; roleIds: readonly number[] },
): string | null {
  if (isNew) return actor.can('roles.create') ? null : "You can't create roles. Ask a manager."
  if (!role) return null
  if (role.is_system) return `${role.name} is built in and can't be changed. It always has every permission.`
  if (!actor.can('roles.update')) return 'You can view this role but not change it.'
  if (actor.roleIds.includes(role.id)) return "You can't edit a role you hold. Ask another manager."
  if (!role.permissions.every((p) => actor.has(p))) return "This role includes access you don't have, so you can't edit it."
  if (!role.editable) return "Someone with this role has access you don't have, so you can't edit it."
  return null
}
