import { authRequest, configureAuth, request } from './client'
import { ApiError } from './errors'

type Call = { url: string; init: RequestInit; headers: Record<string, string> }

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let calls: Call[]
function mockFetch(...responses: (Response | Error)[]) {
  calls = []
  const queue = [...responses]
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init, headers: init.headers as Record<string, string> })
    const next = queue.shift()
    if (!next) throw new Error('unexpected fetch')
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request', () => {
  it('sends the in-memory token and serialises the query', async () => {
    configureAuth({ getAccessToken: () => 'tok', refresh: () => Promise.resolve(null), onSessionEnded: vi.fn() })
    mockFetch(json(200, { ok: true }))
    await request('/orders', { query: { status: ['OPEN', 'BILLED'], offset: 0, q: '', skip: null } })
    expect(calls[0]?.url).toBe('/api/v1/orders?status=OPEN&status=BILLED&offset=0')
    expect(calls[0]?.headers.Authorization).toBe('Bearer tok')
    expect(calls[0]?.init.credentials).toBe('same-origin')
  })

  it('refreshes once on 401 and replays with the same idempotency key', async () => {
    const refresh = vi.fn(() => Promise.resolve('fresh'))
    configureAuth({ getAccessToken: () => 'old', refresh, onSessionEnded: vi.fn() })
    mockFetch(json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }), json(201, { id: 1 }))
    const out = await request<{ id: number }>('/bills/1/payments', { method: 'POST', body: { amount: '1.00' }, idempotencyKey: 'k1' })
    expect(out.id).toBe(1)
    expect(refresh).toHaveBeenCalledWith('old')
    expect(calls).toHaveLength(2)
    expect(calls[1]?.headers.Authorization).toBe('Bearer fresh')
    expect(calls[0]?.headers['Idempotency-Key']).toBe('k1')
    expect(calls[1]?.headers['Idempotency-Key']).toBe('k1')
  })

  it('ends the session when the refresh fails, without looping', async () => {
    const ended = vi.fn()
    configureAuth({ getAccessToken: () => 'old', refresh: () => Promise.resolve(null), onSessionEnded: ended })
    mockFetch(json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in again.' } }))
    await expect(request('/me')).rejects.toMatchObject({ kind: 'session-ended' })
    expect(calls).toHaveLength(1)
    expect(ended).toHaveBeenCalledWith('Sign in again.')
  })

  it('maps error envelopes to typed errors with field details', async () => {
    configureAuth({ getAccessToken: () => 't', refresh: () => Promise.resolve(null), onSessionEnded: vi.fn() })
    mockFetch(json(422, { error: { code: 'VALIDATION_ERROR', message: 'Check the form', details: { fields: [{ field: 'name', message: 'Too long' }] } } }))
    const error = await request('/tables', { method: 'POST', body: {} }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('validation')
    expect((error as ApiError).fields).toEqual({ name: 'Too long' })
  })

  it('reports stale versions distinctly', async () => {
    configureAuth({ getAccessToken: () => 't', refresh: () => Promise.resolve(null), onSessionEnded: vi.fn() })
    mockFetch(json(409, { error: { code: 'STALE_VERSION', message: 'Changed' } }))
    await expect(request('/orders/1', { method: 'PATCH', body: {} })).rejects.toMatchObject({ kind: 'stale' })
  })

  it('reports network failure as offline and does not retry', async () => {
    configureAuth({ getAccessToken: () => 't', refresh: () => Promise.resolve(null), onSessionEnded: vi.fn() })
    mockFetch(new TypeError('Failed to fetch'))
    await expect(request('/bills/1/payments', { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'offline' })
    expect(calls).toHaveLength(1)
  })

  it('does not mistake an HTML error page for data', async () => {
    configureAuth({ getAccessToken: () => 't', refresh: () => Promise.resolve(null), onSessionEnded: vi.fn() })
    mockFetch(new Response('<html>bad gateway</html>', { status: 502 }))
    await expect(request('/floor')).rejects.toMatchObject({ kind: 'server' })
  })

  it('returns undefined for 204', async () => {
    configureAuth({ getAccessToken: () => 't', refresh: () => Promise.resolve(null), onSessionEnded: vi.fn() })
    mockFetch(new Response(null, { status: 204 }))
    await expect(request('/menu/items/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})

describe('authRequest', () => {
  it('always sends the CSRF header, the cookie and no stale token', async () => {
    mockFetch(json(200, { access_token: 'a', token_type: 'bearer', expires_in: 900 }))
    await authRequest('/auth/web/refresh')
    expect(calls[0]?.url).toBe('/api/v1/auth/web/refresh')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.headers['X-Bistro-Client']).toBe('web')
    expect(calls[0]?.headers.Authorization).toBeUndefined()
    expect(calls[0]?.init.credentials).toBe('same-origin')
  })
})
