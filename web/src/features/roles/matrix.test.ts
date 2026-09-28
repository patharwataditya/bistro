import type { PermissionInfo, Role } from '@/api/types'
import { Grants } from '@/auth/permissions'
import { diffRole, formOf, groupPermissions, humanize, isDangerous, readOnlyReason, selectAllState, toggleGroup } from './matrix'

const catalog: PermissionInfo[] = [
  { code: 'tables.view', group: 'Tables', description: 'See the floor' },
  { code: 'tables.manage_status', group: 'Tables', description: 'Mark tables' },
  { code: 'orders.view', group: 'Orders', description: 'See orders' },
  { code: 'orders.cancel', group: 'Orders', description: 'Void and cancel' },
  { code: 'tables.delete', group: 'Tables', description: 'Remove tables' },
  { code: 'billing.process_payment', group: 'Billing', description: 'Take payments' },
]

const role = (over: Partial<Role> = {}): Role => ({
  id: 7, name: 'Waiter', description: 'Serves tables', is_system: false, permissions: ['tables.view', 'orders.view'],
  member_count: 2, version: 4, editable: true, ...over,
})

describe('groupPermissions', () => {
  it('orders groups like the app and actions view → create → update → others → delete', () => {
    const groups = groupPermissions([...catalog].reverse().concat([
      { code: 'tables.create', group: 'Tables', description: 'Add' },
      { code: 'zeta.view', group: 'Zeta', description: 'Unknown group' },
    ]))
    expect(groups.map((g) => g.group)).toEqual(['Tables', 'Orders', 'Billing', 'Zeta'])
    expect(groups[0]?.cells.map((c) => c.code)).toEqual(['tables.view', 'tables.create', 'tables.manage_status', 'tables.delete'])
  })
  it('labels actions in plain words and flags sensitive ones', () => {
    const cells = groupPermissions(catalog).flatMap((g) => g.cells)
    expect(cells.find((c) => c.code === 'tables.manage_status')?.label).toBe('Manage status')
    expect(cells.find((c) => c.code === 'billing.process_payment')?.label).toBe('Process payment')
    expect(cells.find((c) => c.code === 'orders.cancel')?.dangerous).toBe(true)
    expect(cells.find((c) => c.code === 'orders.view')?.dangerous).toBe(false)
  })
  it('humanizes', () => expect(humanize('view')).toBe('View'))
})

describe('isDangerous', () => {
  it.each(['roles.view', 'roles.delete', 'staff.create', 'billing.refund', 'billing.void', 'settings.update', 'orders.cancel'])('%s', (c) => {
    expect(isDangerous(c)).toBe(true)
  })
  it.each(['settings.view', 'billing.view', 'menu.update'])('%s is not', (c) => expect(isDangerous(c)).toBe(false))
})

describe('select all', () => {
  const codes = ['tables.view', 'tables.manage_status', 'tables.delete']
  const grants = new Grants(['tables.view', 'tables.manage_status'])

  it('counts only grantable permissions', () => {
    expect(selectAllState(codes, new Set(), grants)).toBe(false)
    expect(selectAllState(codes, new Set(['tables.view']), grants)).toBe('indeterminate')
    // tables.delete is locked, so the two grantable ones make the group "all on".
    expect(selectAllState(codes, new Set(['tables.view', 'tables.manage_status']), grants)).toBe(true)
  })
  it('is off when nothing in the group is grantable', () => {
    expect(selectAllState(codes, new Set(['tables.delete']), new Grants([]))).toBe(false)
  })
  it('never adds a permission the actor lacks', () => {
    const next = toggleGroup(codes, new Set(), grants, true)
    expect([...next].sort()).toEqual(['tables.manage_status', 'tables.view'])
  })
  it('turning off leaves locked permissions the role already has', () => {
    const next = toggleGroup(codes, new Set(['tables.view', 'tables.delete', 'orders.view']), grants, false)
    expect([...next].sort()).toEqual(['orders.view', 'tables.delete'])
  })
})

describe('diffRole', () => {
  it('sends only the version when nothing changed', () => {
    const r = role()
    expect(diffRole(r, { ...formOf(r), name: ' Waiter ' })).toEqual({ version: 4 })
  })
  it('sends changed name and description, trimmed', () => {
    const r = role()
    expect(diffRole(r, { ...formOf(r), name: 'Server ', description: '' })).toEqual({ version: 4, name: 'Server', description: '' })
  })
  it('sends permissions sorted only when the set changed', () => {
    const r = role()
    expect(diffRole(r, { ...formOf(r), permissions: new Set(['orders.view', 'tables.view']) })).toEqual({ version: 4 })
    expect(diffRole(r, { ...formOf(r), permissions: new Set(['tables.view', 'orders.view', 'kitchen.view']) }))
      .toEqual({ version: 4, permissions: ['kitchen.view', 'orders.view', 'tables.view'] })
  })
  it('treats a null description as empty', () => {
    const r = role({ description: null })
    expect(diffRole(r, formOf(r))).toEqual({ version: 4 })
  })
})

describe('readOnlyReason', () => {
  const actor = (codes: string[], roleIds: number[] = []) => {
    const g = new Grants(codes)
    return { can: (p: 'roles.create' | 'roles.update') => g.has(p), has: (c: string) => g.has(c), roleIds }
  }
  const all = ['roles.create', 'roles.update', 'tables.view', 'orders.view']
  it('explains each lock in order', () => {
    expect(readOnlyReason(true, null, actor([]))).toBe("You can't create roles. Ask a manager.")
    expect(readOnlyReason(true, null, actor(all))).toBeNull()
    expect(readOnlyReason(false, role({ is_system: true, name: 'Owner' }), actor(all))).toMatch(/^Owner is built in/)
    expect(readOnlyReason(false, role(), actor(['tables.view']))).toBe('You can view this role but not change it.')
    expect(readOnlyReason(false, role(), actor(all, [7]))).toBe("You can't edit a role you hold. Ask another manager.")
    expect(readOnlyReason(false, role({ permissions: ['billing.refund'] }), actor(all))).toBe("This role includes access you don't have, so you can't edit it.")
    expect(readOnlyReason(false, role({ editable: false }), actor(all))).toBe("Someone with this role has access you don't have, so you can't edit it.")
    expect(readOnlyReason(false, role(), actor(all))).toBeNull()
  })
})
