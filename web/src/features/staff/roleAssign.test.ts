import { Grants } from '@/auth/permissions'
import { assignable, rolesFromMembers } from './roleAssign'

describe('assignable', () => {
  const actor = new Grants(['menu.view', 'orders.view', 'orders.update'])
  it('allows a role whose permissions are a subset of the actor', () => {
    expect(assignable(['menu.view', 'orders.view'], actor)).toBe(true)
    expect(assignable([], actor)).toBe(true)
  })
  it('allows an identical permission set (peers)', () => {
    expect(assignable(['menu.view', 'orders.view', 'orders.update'], actor)).toBe(true)
  })
  it('locks a role with any permission the actor lacks', () => {
    expect(assignable(['menu.view', 'billing.refund'], actor)).toBe(false)
  })
  it('leaves the decision to the server when permissions are unknown', () => {
    expect(assignable(null, actor)).toBe(true)
  })
})

describe('rolesFromMembers', () => {
  it('dedupes and sorts roles by name, with unknown permissions', () => {
    const out = rolesFromMembers([
      { roles: [{ id: 2, name: 'Waiter' }, { id: 1, name: 'Cashier' }] },
      { roles: [{ id: 2, name: 'Waiter' }] },
    ])
    expect(out).toEqual([{ id: 1, name: 'Cashier', permissions: null }, { id: 2, name: 'Waiter', permissions: null }])
  })
})
