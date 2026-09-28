import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { createBrowserRouter, Outlet } from 'react-router'
import { P, type Permission } from '@/auth/permissions'
import { SkeletonList } from '@/ui/States'
import { HomeRedirect, NotFound, RequireAny, RequireSession, RouteError } from './guards'
import { LoginPage } from './LoginPage'
import { Shell } from './Shell'

const RELOADED = 'bistro.chunk-reload'

/**
 * After a deploy, a tab that loaded the previous build asks for chunk files that no longer
 * exist. Reload once to pick up the new build; a second failure surfaces as a normal error.
 */
function recoverable(load: () => Promise<{ default: ComponentType }>) {
  return () =>
    load().then(
      (module) => {
        try { sessionStorage.removeItem(RELOADED) } catch { /* storage unavailable */ }
        return module
      },
      (error: unknown) => {
        let reloaded = true
        try {
          reloaded = sessionStorage.getItem(RELOADED) === '1'
          if (!reloaded) sessionStorage.setItem(RELOADED, '1')
        } catch { /* storage unavailable: don't risk a reload loop */ }
        if (!reloaded) {
          window.location.reload()
          return new Promise<never>(() => {})
        }
        throw error
      },
    )
}

function page(load: () => Promise<{ default: ComponentType }>, any: Permission[]): ReactNode {
  const Component = lazy(recoverable(load))
  return (
    <RequireAny any={any}>
      <Suspense fallback={<SkeletonList rows={6} className="pt-4" />}>
        <div className="page-enter">
          <Component />
        </div>
      </Suspense>
    </RequireAny>
  )
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    errorElement: <RouteError />,
    element: (
      <RequireSession>
        <Outlet />
      </RequireSession>
    ),
    children: [
      {
        element: <Shell />,
        children: [
          {
            errorElement: <RouteError />,
            children: [
              { index: true, element: <HomeRedirect /> },
              { path: 'dashboard', element: page(() => import('@/features/dashboard/DashboardPage'), [P.DASHBOARD_VIEW]) },
              { path: 'floor', element: page(() => import('@/features/floor/FloorPage'), [P.TABLES_VIEW]) },
              { path: 'orders', element: page(() => import('@/features/orders/OrdersPage'), [P.ORDERS_VIEW]) },
              { path: 'orders/:orderId', element: page(() => import('@/features/orders/OrderPage'), [P.ORDERS_VIEW]) },
              { path: 'kitchen', element: page(() => import('@/features/kitchen/KitchenPage'), [P.KITCHEN_VIEW]) },
              { path: 'bills', element: page(() => import('@/features/billing/BillsPage'), [P.BILLING_VIEW]) },
              { path: 'bills/:billId', element: page(() => import('@/features/billing/BillsPage'), [P.BILLING_VIEW]) },
              { path: 'menu', element: page(() => import('@/features/menu/MenuPage'), [P.MENU_VIEW]) },
              { path: 'tables', element: page(() => import('@/features/floor/TablesManagePage'), [P.TABLES_CREATE, P.TABLES_UPDATE, P.TABLES_DELETE]) },
              { path: 'reports', element: page(() => import('@/features/reports/ReportsPage'), [P.REPORTS_VIEW]) },
              { path: 'staff', element: page(() => import('@/features/staff/StaffPage'), [P.STAFF_VIEW]) },
              { path: 'roles', element: page(() => import('@/features/roles/RolesPage'), [P.ROLES_VIEW]) },
              { path: 'roles/:roleId', element: page(() => import('@/features/roles/RoleEditPage'), [P.ROLES_VIEW]) },
              { path: 'settings', element: page(() => import('@/features/settings/SettingsPage'), [P.SETTINGS_VIEW]) },
              { path: 'audit', element: page(() => import('@/features/audit/AuditPage'), [P.AUDIT_LOGS_VIEW]) },
              { path: 'account', element: page(() => import('@/features/account/AccountPage'), []) },
              { path: 'more', element: page(() => import('@/features/account/MorePage'), []) },
              { path: '*', element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
])
