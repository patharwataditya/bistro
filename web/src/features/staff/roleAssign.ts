/**
 * Which roles the signed-in person may give to someone. Mirrors the server's anti-escalation
 * rule (services/staff.py): a role is assignable only when every permission it carries is one
 * the actor holds. The server still decides; this only explains the choice up front.
 */
export interface RoleOption {
  id: number
  name: string
  /** null when the actor can't read roles (no roles.view): the server decides. */
  permissions: readonly string[] | null
}

export function assignable(rolePerms: readonly string[] | null, actorPerms: { has: (code: string) => boolean }): boolean {
  if (rolePerms === null) return true
  return rolePerms.every((p) => actorPerms.has(p))
}

/** Roles present on the listed people, for when the full role list can't be read. */
export function rolesFromMembers(members: readonly { roles: readonly { id: number; name: string }[] }[]): RoleOption[] {
  const seen = new Map<number, RoleOption>()
  for (const m of members) for (const r of m.roles) if (!seen.has(r.id)) seen.set(r.id, { id: r.id, name: r.name, permissions: null })
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}
