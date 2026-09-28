import { useQuery } from '@tanstack/react-query'
import { request } from '@/api/client'
import type { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { components } from '@/api/schema'
import type { Menu, MenuCategory, MenuItem } from '@/api/types'

type S = components['schemas']
export type MenuItemIn = S['MenuItemIn']
export type MenuItemUpdate = S['MenuItemUpdate']
export type CategoryIn = S['CategoryIn']
export type CategoryUpdate = S['CategoryUpdate']

/** The menu, refreshed every 30 s while visible (Android's Menu cadence). */
export const useMenuManage = () =>
  useQuery<Menu, ApiError>({
    queryKey: keys.menu,
    queryFn: ({ signal }) => request<Menu>('/menu', { signal }),
    refetchInterval: 30_000,
  })

export const menuApi = {
  createItem: (body: MenuItemIn) => request<MenuItem>('/menu/items', { method: 'POST', body }),
  updateItem: (id: number, body: MenuItemUpdate) => request<MenuItem>(`/menu/items/${id}`, { method: 'PATCH', body }),
  deleteItem: (id: number) => request<undefined>(`/menu/items/${id}`, { method: 'DELETE' }),
  setAvailability: (id: number, version: number, isAvailable: boolean) =>
    request<MenuItem>(`/menu/items/${id}/availability`, { method: 'POST', body: { version, is_available: isAvailable } satisfies S['AvailabilityIn'] }),
  createCategory: (body: CategoryIn) => request<MenuCategory>('/menu/categories', { method: 'POST', body }),
  updateCategory: (id: number, body: CategoryUpdate) => request<MenuCategory>(`/menu/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory: (id: number) => request<undefined>(`/menu/categories/${id}`, { method: 'DELETE' }),
}
