import { useQuery } from '@tanstack/react-query'
import { request } from '@/api/client'
import type { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { components } from '@/api/schema'
import type { PermissionInfo, Role } from '@/api/types'

type S = components['schemas']
export type RoleCreateBody = S['RoleCreate']
export type RoleUpdateBody = S['RoleUpdate']

/** Roles refresh every 60 s while visible (Android parity). */
export function useRolesLive() {
  return useQuery<Role[], ApiError>({
    queryKey: keys.roles,
    queryFn: ({ signal }) => request<Role[]>('/roles', { signal }),
    refetchInterval: 60_000,
  })
}

export function usePermissionCatalog() {
  return useQuery<PermissionInfo[], ApiError>({
    queryKey: keys.permissions,
    queryFn: ({ signal }) => request<PermissionInfo[]>('/permissions', { signal }),
    staleTime: 300_000,
  })
}

export const rolesApi = {
  create: (body: RoleCreateBody) => request<Role>('/roles', { method: 'POST', body }),
  update: (id: number, body: RoleUpdateBody) => request<Role>(`/roles/${id}`, { method: 'PATCH', body }),
  remove: (id: number) => request<undefined>(`/roles/${id}`, { method: 'DELETE' }),
}
