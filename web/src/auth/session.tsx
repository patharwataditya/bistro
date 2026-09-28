/**
 * The signed-in state. The access token lives only in memory; the refresh token is an
 * HttpOnly cookie this code never sees. Refreshes are single-flight across every tab (Web
 * Locks), because all tabs share one cookie and one rotating refresh chain: two concurrent
 * rotations would trip the server's reuse detection. Sign-in/out is mirrored to other tabs.
 */
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { authRequest, configureAuth, request } from '@/api/client'
import { ApiError } from '@/api/errors'
import type { Me, WebSession } from '@/api/types'
import { Grants, type Permission } from './permissions'

export type SessionState =
  | { status: 'restoring' }
  | { status: 'restore-failed'; error: ApiError }
  | { status: 'signed-out'; notice: string | null }
  | { status: 'signed-in'; me: Me; grants: Grants }

interface SessionApi {
  state: SessionState
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  signOutEverywhere: () => Promise<void>
  changePassword: (current: string, next: string) => Promise<void>
  retryRestore: () => void
  reloadProfile: () => Promise<void>
}

const SessionContext = createContext<SessionApi | null>(null)
const CHANNEL = 'bistro-session'
const LOCK = 'bistro-auth-refresh'

let accessToken: string | null = null

async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if ('locks' in navigator && navigator.locks) {
    return navigator.locks.request(LOCK, { mode: 'exclusive' }, fn) as Promise<T>
  }
  return fn()
}

function toError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError('unexpected', 'Something unexpected happened. Try again.')
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'restoring' })
  const queryClient = useQueryClient()
  const channel = useRef<BroadcastChannel | null>(null)

  const endLocally = useCallback(
    (notice: string | null) => {
      accessToken = null
      queryClient.clear() // nothing the previous user loaded survives in memory
      setState((s) => (s.status === 'signed-out' ? s : { status: 'signed-out', notice }))
    },
    [queryClient],
  )

  /** Returns a fresh access token, or null when the session is over (throws on network trouble). */
  const refresh = useCallback(async (failedToken: string | null): Promise<string | null> => {
    return withRefreshLock(async () => {
      // Another request in this tab already refreshed while we waited for the lock.
      if (accessToken && accessToken !== failedToken) return accessToken
      try {
        const s = await authRequest<WebSession>('/auth/web/refresh')
        accessToken = s.access_token
        return accessToken
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'session-ended') return null
        throw e
      }
    })
  }, [])

  const loadMe = useCallback(async () => {
    const me = await request<Me>('/me')
    setState({ status: 'signed-in', me, grants: new Grants(me.permissions) })
  }, [])

  const restore = useCallback(async () => {
    try {
      const token = await refresh(null)
      if (!token) {
        setState({ status: 'signed-out', notice: null })
        return
      }
      await loadMe()
    } catch (e) {
      const err = toError(e)
      if (err.kind === 'session-ended') setState({ status: 'signed-out', notice: null })
      else setState({ status: 'restore-failed', error: err })
    }
  }, [refresh, loadMe])

  useEffect(() => {
    configureAuth({
      getAccessToken: () => accessToken,
      refresh: async (failed) => {
        try {
          return await refresh(failed)
        } catch {
          // Network trouble while refreshing is not the end of the session: the original
          // request fails as offline and the user keeps their place.
          throw new ApiError('offline', "Can't reach Bistro. Check the connection and try again.")
        }
      },
      onSessionEnded: (message) => endLocally(message),
    })
  }, [refresh, endLocally])

  useEffect(() => {
    // Syncs with an external system (the server session); state is only set after the
    // network responds, never synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore()
  }, [restore])

  // Mirror sign-in / sign-out across tabs.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL)
    channel.current = ch
    ch.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === 'signed-out') endLocally('You signed out in another tab.')
      if (event.data === 'signed-in') void restore()
    }
    return () => {
      ch.close()
      channel.current = null
    }
  }, [endLocally, restore])

  const signIn = useCallback(
    async (username: string, password: string) => {
      const s = await authRequest<WebSession>('/auth/web/login', {
        username: username.trim(),
        password,
        device_label: `Web · ${navigator.platform || 'browser'}`.slice(0, 120),
      })
      accessToken = s.access_token
      queryClient.clear()
      await loadMe()
      channel.current?.postMessage('signed-in')
    },
    [loadMe, queryClient],
  )

  const signOut = useCallback(async () => {
    // Local first: a slow network can never leave anyone half signed out.
    endLocally(null)
    channel.current?.postMessage('signed-out')
    try {
      await authRequest('/auth/web/logout')
    } catch {
      // The cookie is cleared server-side on the next successful call; the session also
      // idles out. Nothing more to do here.
    }
  }, [endLocally])

  const signOutEverywhere = useCallback(async () => {
    await authRequest('/auth/web/logout-all', undefined, accessToken)
    endLocally(null)
    channel.current?.postMessage('signed-out')
  }, [endLocally])

  const changePassword = useCallback(async (current: string, next: string) => {
    const s = await authRequest<WebSession>('/auth/web/password', { current_password: current, new_password: next }, accessToken)
    accessToken = s.access_token
  }, [])

  const reloadProfile = useCallback(async () => {
    if (!accessToken) return
    try {
      await loadMe()
    } catch {
      // Keep the current profile; the next request will surface any real problem.
    }
  }, [loadMe])

  // Permissions can be changed by a manager at any time: re-read the profile when the
  // window regains focus (at most once a minute).
  useEffect(() => {
    let last = Date.now()
    const onFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 60_000) {
        last = Date.now()
        void reloadProfile()
      }
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [reloadProfile])

  const api = useMemo<SessionApi>(
    () => ({ state, signIn, signOut, signOutEverywhere, changePassword, retryRestore: () => {
      setState({ status: 'restoring' })
      void restore()
    }, reloadProfile }),
    [state, signIn, signOut, signOutEverywhere, changePassword, restore, reloadProfile],
  )
  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession outside SessionProvider')
  return ctx
}

/** The signed-in user; only valid inside the signed-in app shell. */
export function useMe(): { me: Me; grants: Grants; can: (p: Permission) => boolean } {
  const { state } = useSession()
  if (state.status !== 'signed-in') throw new Error('useMe outside the signed-in app')
  return { me: state.me, grants: state.grants, can: (p) => state.grants.can(p) }
}
