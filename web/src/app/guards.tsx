import { CircleAlert, Lock, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate, useLocation, useRouteError } from 'react-router'
import type { Permission } from '@/auth/permissions'
import { useMe, useSession } from '@/auth/session'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/States'
import { homePath } from './nav'

/**
 * Client-side route gate. This is UX only — every API call is authorised by the server —
 * but it means a hand-typed URL shows a clear explanation instead of a broken page.
 */
export function RequireAny({ any, children }: { any: Permission[]; children: ReactNode }) {
  const { grants } = useMe()
  if (any.length > 0 && !grants.any(...any)) return <Forbidden />
  return <>{children}</>
}

export function Forbidden() {
  const { grants } = useMe()
  return (
    <EmptyState
      icon={Lock}
      title="Not available to you"
      message="Your role doesn't include this part of Bistro. If you need it, ask a manager to update your access."
      action={<Link to={homePath(grants)}><Button variant="secondary">Go to your start page</Button></Link>}
      className="py-24"
    />
  )
}

export function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Page not found"
      message="That address doesn't match anything in Bistro."
      action={<Link to="/"><Button variant="secondary">Back to Bistro</Button></Link>}
      className="py-24"
    />
  )
}

/** Signed-in area. Unauthenticated visitors go to sign-in, remembering where they were going. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { state } = useSession()
  const location = useLocation()
  if (state.status !== 'signed-in') {
    const next = location.pathname + location.search
    return <Navigate to={`/login${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />
  }
  return <>{children}</>
}

export function HomeRedirect() {
  const { grants } = useMe()
  return <Navigate to={homePath(grants)} replace />
}

/**
 * Last-resort boundary for a render crash. It never shows a stack trace (the details go to
 * the console only); the only offer is a reload, which re-fetches everything from the server.
 */
export function RouteError() {
  const error = useRouteError()
  console.error(error)
  return (
    <div role="alert" className="grid min-h-[60vh] place-items-center px-4">
      <EmptyState
        icon={CircleAlert}
        title="Something went wrong"
        message="This screen hit an unexpected problem. Nothing you already saved is lost — reload to continue."
        action={<Button variant="secondary" onClick={() => window.location.reload()}>Reload</Button>}
      />
    </div>
  )
}
