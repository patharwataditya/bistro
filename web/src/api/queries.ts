/**
 * Server state. Reads are cached per key and refreshed on an interval only while the page is
 * visible (restaurant state changes fast; correctness beats a stale-but-instant screen).
 * Mutations are never retried automatically: a retry is always an explicit user action that
 * reuses the same idempotency key.
 */
import { keepPreviousData, QueryClient, useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from '@tanstack/react-query'
import { request } from './client'
import { ApiError } from './errors'
import type {
  Bill, BillSummary, Dashboard, Floor, KitchenBoard, Menu, Order, OrderSummary, Page,
  PaymentMethod, PermissionInfo, Report, RestaurantSettings, Role, StaffMember,
} from './types'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        refetchOnWindowFocus: true,
        refetchIntervalInBackground: false,
        retry: (count, error) => count < 1 && error instanceof ApiError && error.retryable,
      },
      mutations: { retry: false },
    },
  })
}

export const keys = {
  floor: ['floor'] as const,
  menu: ['menu'] as const,
  order: (id: number) => ['order', id] as const,
  orders: (filter: string) => ['orders', filter] as const,
  kitchen: ['kitchen'] as const,
  bills: (filter: string) => ['bills', filter] as const,
  bill: (id: number) => ['bill', id] as const,
  paymentMethods: ['payment-methods'] as const,
  dashboard: ['dashboard'] as const,
  report: (start: string, end: string) => ['report', start, end] as const,
  audit: (filter: string) => ['audit', filter] as const,
  users: (filter: string) => ['users', filter] as const,
  roles: ['roles'] as const,
  permissions: ['permissions'] as const,
  settings: ['settings'] as const,
}

type Opts<T> = Omit<UseQueryOptions<T, ApiError, T, QueryKey>, 'queryKey' | 'queryFn'>

function useApi<T>(key: QueryKey, path: string, query?: Record<string, string | number | boolean | readonly string[] | null | undefined>, opts?: Opts<T>) {
  return useQuery<T, ApiError, T, QueryKey>({
    queryKey: key,
    queryFn: ({ signal }) => request<T>(path, { query, signal }),
    ...opts,
  })
}

export const useFloor = (poll = 5_000) => useApi<Floor>(keys.floor, '/tables', undefined, { refetchInterval: poll })
export const useMenu = () => useApi<Menu>(keys.menu, '/menu', undefined, { staleTime: 30_000 })
/**
 * A poll that started before a save and answers after it must not paint the older check
 * over the newer one the save put in the cache. Equal versions still win: kitchen progress
 * changes item states without bumping the order version.
 */
export function useOrder(id: number) {
  const qc = useQueryClient()
  return useQuery<Order, ApiError, Order, QueryKey>({
    queryKey: keys.order(id),
    queryFn: async ({ signal }) => {
      const fresh = await request<Order>(`/orders/${id}`, { signal })
      const cached = qc.getQueryData<Order>(keys.order(id))
      return cached && cached.id === fresh.id && cached.version > fresh.version ? cached : fresh
    },
    refetchInterval: 8_000,
  })
}
export const useKitchen = () => useApi<KitchenBoard>(keys.kitchen, '/kitchen/tickets', { include_recent: true }, { refetchInterval: 4_000 })
export const useBill = (id: number, live: boolean) => useApi<Bill>(keys.bill(id), `/bills/${id}`, undefined, { refetchInterval: live ? 10_000 : 60_000 })
export const usePaymentMethods = (enabled = true) => useApi<PaymentMethod[]>(keys.paymentMethods, '/payment-methods', undefined, { staleTime: 60_000, enabled })
export const useDashboard = () => useApi<Dashboard>(keys.dashboard, '/dashboard', undefined, { refetchInterval: 10_000 })
export const useSettings = (enabled = true) => useApi<RestaurantSettings>(keys.settings, '/settings', undefined, { enabled })
export const useRoles = (enabled = true) => useApi<Role[]>(keys.roles, '/roles', undefined, { enabled })
export const usePermissions = (enabled = true) => useApi<PermissionInfo[]>(keys.permissions, '/permissions', undefined, { staleTime: 300_000, enabled })

export const useReport = (start: string, end: string) =>
  useApi<Report>(keys.report(start, end), '/reports/summary', { start, end }, { placeholderData: keepPreviousData })

export const useOrders = (statuses: readonly string[], offset = 0, limit = 50) =>
  useApi<Page<OrderSummary>>(keys.orders(`${statuses.join(',')}|${offset}|${limit}`), '/orders', { status: statuses, offset, limit }, {
    refetchInterval: 15_000, placeholderData: keepPreviousData,
  })

export const useBills = (statuses: readonly string[], paidSince: string | null, offset = 0, limit = 50) =>
  useApi<Page<BillSummary>>(keys.bills(`${statuses.join(',')}|${paidSince ?? ''}|${offset}|${limit}`), '/bills', {
    status: statuses, paid_since: paidSince, offset, limit,
  }, { refetchInterval: 10_000, placeholderData: keepPreviousData })

export const useUsers = (includeInactive: boolean, q: string, offset = 0, limit = 50) =>
  useApi<Page<StaffMember>>(keys.users(`${includeInactive}|${q}|${offset}|${limit}`), '/users', {
    include_inactive: includeInactive, q: q || undefined, offset, limit,
  }, { placeholderData: keepPreviousData })

export interface AuditFilter { action?: string; actorId?: number; entityType?: string; since?: string; until?: string }
