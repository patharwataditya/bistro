/**
 * The only place the app talks HTTP. Adds the in-memory access token, maps every failure to
 * an ApiError, refreshes once on 401 (single-flight across tabs), and never silently retries
 * a request that may have reached the server.
 */
import { ApiError, fromResponse } from './errors'

export const API_BASE = '/api/v1'
const TIMEOUT_MS = 20_000

type Query = Record<string, string | number | boolean | readonly (string | number)[] | null | undefined>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  query?: Query
  body?: unknown
  idempotencyKey?: string
  signal?: AbortSignal
  /** Internal: auth endpoints must not trigger a refresh loop. */
  skipAuth?: boolean
}

interface TokenHooks {
  getAccessToken: () => string | null
  /** Resolves to a fresh access token, or null when the session is over. */
  refresh: (failedToken: string | null) => Promise<string | null>
  onSessionEnded: (message: string) => void
}

let hooks: TokenHooks = {
  getAccessToken: () => null,
  refresh: () => Promise.resolve(null),
  onSessionEnded: () => undefined,
}

export function configureAuth(next: TokenHooks): void {
  hooks = next
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams()
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)))
      else params.set(key, String(value))
    }
  }
  const qs = params.toString()
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`
}

function newRequestId(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Request-ID': newRequestId() }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new ApiError('timeout', 'The server is taking too long to respond. Try again.')
    }
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError('offline', "Can't reach Bistro. Check the connection and try again.")
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  if (!res.ok) throw fromResponse(res.status, body)
  if (body === null && text) throw new ApiError('unexpected', 'The server sent something this app does not understand.')
  return body as T
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = opts.skipAuth ? null : hooks.getAccessToken()
  let res = await send(path, opts, token)
  if (res.status === 401 && !opts.skipAuth) {
    // The server rejects unauthenticated requests before running any handler, so replaying
    // once with a fresh token is safe even for payments.
    const fresh = await hooks.refresh(token)
    if (fresh) {
      res = await send(path, opts, fresh)
    }
  }
  try {
    return await parse<T>(res)
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'session-ended' && !opts.skipAuth) hooks.onSessionEnded(e.message)
    throw e
  }
}

/** Web-auth endpoints: cookie-carrying, CSRF header, never through the refresh path. */
export function authRequest<T>(path: string, body?: unknown, accessToken?: string | null): Promise<T> {
  return (async () => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Bistro-Client': 'web',
      'X-Request-ID': newRequestId(),
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    let res: Response
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        throw new ApiError('timeout', 'The server is taking too long to respond. Try again.')
      }
      throw new ApiError('offline', "Can't reach Bistro. Check the connection and try again.")
    }
    return parse<T>(res)
  })()
}
