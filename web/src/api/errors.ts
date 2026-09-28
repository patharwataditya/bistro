/**
 * Every failure the UI can meet, already translated into something a person can act on —
 * the same categories as the Android app's AppError. Server messages are written for staff
 * and shown as-is; internal details never reach the UI.
 */
export type ErrorKind =
  | 'offline'
  | 'timeout'
  | 'session-ended'
  | 'forbidden'
  | 'not-found'
  | 'stale'
  | 'invalid-state'
  | 'conflict'
  | 'validation'
  | 'rate-limited'
  | 'server'
  | 'unexpected'

export interface FieldErrors {
  [field: string]: string
}

export class ApiError extends Error {
  readonly kind: ErrorKind
  readonly status: number
  readonly code: string | null
  readonly fields: FieldErrors
  readonly retryAfterSeconds: number | null

  constructor(kind: ErrorKind, message: string, opts: { status?: number; code?: string | null; fields?: FieldErrors; retryAfterSeconds?: number | null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = opts.status ?? 0
    this.code = opts.code ?? null
    this.fields = opts.fields ?? {}
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null
  }

  /** Worth a "Try again" button. */
  get retryable(): boolean {
    return this.kind === 'offline' || this.kind === 'timeout' || this.kind === 'server' || this.kind === 'unexpected'
  }
}

interface Envelope {
  error?: { code?: unknown; message?: unknown; details?: unknown }
}

function fieldErrors(details: unknown): FieldErrors {
  if (!details || typeof details !== 'object') return {}
  const fields = (details as { fields?: unknown }).fields
  if (!Array.isArray(fields)) return {}
  const out: FieldErrors = {}
  for (const f of fields) {
    if (f && typeof f === 'object' && typeof (f as { field?: unknown }).field === 'string') {
      const msg = (f as { message?: unknown }).message
      out[(f as { field: string }).field] = typeof msg === 'string' ? msg : 'Invalid'
    }
  }
  return out
}

/** Map an HTTP error response (JSON envelope or otherwise) to an ApiError. */
export function fromResponse(status: number, body: unknown): ApiError {
  const env = (body && typeof body === 'object' ? (body as Envelope).error : undefined) ?? undefined
  const code = typeof env?.code === 'string' ? env.code : null
  const message = typeof env?.message === 'string' ? env.message : null
  const details = env?.details
  const opts = { status, code }
  switch (code) {
    case 'UNAUTHENTICATED':
    case 'TOKEN_EXPIRED':
    case 'ACCOUNT_INACTIVE':
      return new ApiError('session-ended', message ?? 'Your session has ended. Sign in again.', opts)
    case 'INVALID_CREDENTIALS':
      return new ApiError('validation', message ?? 'Incorrect username or password.', opts)
    case 'PERMISSION_DENIED':
      return new ApiError('forbidden', message ?? "You don't have permission to do that.", opts)
    case 'NOT_FOUND':
      return new ApiError('not-found', message ?? 'That no longer exists.', opts)
    case 'STALE_VERSION':
      return new ApiError('stale', message ?? 'Someone else changed this. Refresh and try again.', opts)
    case 'INVALID_TRANSITION':
      return new ApiError('invalid-state', message ?? "That can't be done right now.", opts)
    case 'CONFLICT':
    case 'IDEMPOTENCY_MISMATCH':
      return new ApiError('conflict', message ?? 'That conflicts with existing data.', opts)
    case 'VALIDATION_ERROR':
      return new ApiError('validation', message ?? 'Some fields need attention.', { ...opts, fields: fieldErrors(details) })
    case 'RATE_LIMITED':
    case 'ACCOUNT_LOCKED': {
      const retry = details && typeof details === 'object' ? (details as { retry_after_seconds?: unknown }).retry_after_seconds : undefined
      return new ApiError('rate-limited', message ?? 'Too many attempts. Wait a moment and try again.', {
        ...opts,
        retryAfterSeconds: typeof retry === 'number' ? retry : null,
      })
    }
    case 'INTERNAL_ERROR':
      return new ApiError('server', message ?? 'The server is having trouble. Try again in a moment.', opts)
    default:
      break
  }
  if (status === 401) return new ApiError('session-ended', 'Your session has ended. Sign in again.', opts)
  if (status === 403) return new ApiError('forbidden', "You don't have permission to do that.", opts)
  if (status === 404) return new ApiError('not-found', 'That no longer exists.', opts)
  if (status === 409) return new ApiError('conflict', message ?? 'That conflicts with existing data.', opts)
  if (status === 413) return new ApiError('validation', "That's too much data to send at once.", opts)
  if (status === 429) return new ApiError('rate-limited', 'Too many attempts. Wait a moment and try again.', opts)
  if (status >= 500) return new ApiError('server', 'The server is having trouble. Try again in a moment.', opts)
  return new ApiError('unexpected', message ?? `The server couldn't complete that (${status}).`, opts)
}
