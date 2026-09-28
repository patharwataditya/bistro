import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { request } from '@/api/client'
import type { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { components } from '@/api/schema'
import type { Page, Role, StaffMember } from '@/api/types'

type S = components['schemas']
export type UserCreateBody = S['UserCreate']
export type UserUpdateBody = S['UserUpdate']

export const PAGE_SIZE = 25

/** Staff and Roles refresh every 60 s while visible (Android parity). */
export function useStaffPage(includeInactive: boolean, q: string, offset: number) {
  return useQuery<Page<StaffMember>, ApiError>({
    queryKey: keys.users(`${includeInactive}|${q}|${offset}|${PAGE_SIZE}`),
    queryFn: ({ signal }) =>
      request<Page<StaffMember>>('/users', { query: { include_inactive: includeInactive, q: q || undefined, offset, limit: PAGE_SIZE }, signal }),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useRoleList(enabled: boolean) {
  return useQuery<Role[], ApiError>({
    queryKey: keys.roles,
    queryFn: ({ signal }) => request<Role[]>('/roles', { signal }),
    refetchInterval: 60_000,
    enabled,
  })
}

export const staffApi = {
  create: (body: UserCreateBody) => request<StaffMember>('/users', { method: 'POST', body }),
  update: (id: number, body: UserUpdateBody) => request<StaffMember>(`/users/${id}`, { method: 'PATCH', body }),
  setActive: (id: number, version: number, active: boolean) =>
    request<StaffMember>(`/users/${id}/${active ? 'reactivate' : 'deactivate'}`, { method: 'POST', body: { version } satisfies S['VersionIn'] }),
  resetPassword: (id: number, version: number, password: string) =>
    request<StaffMember>(`/users/${id}/password`, { method: 'POST', body: { version, new_password: password } satisfies S['ResetPasswordIn'] }),
}
