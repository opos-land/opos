import { HttpException } from '@nestjs/common'
import { type ApiError as ApiErrorBody, type ErrorCode } from '@opos/contract'

/** An error the client handles by its `code`; the filter turns it into the error body. */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly params?: ApiErrorBody['params'],
    /** Response headers that go out with the error, e.g. `Retry-After` on a 429. */
    readonly headers?: Record<string, string>,
    /**
     * An expected 5xx, such as a busy tenant, is logged as a warning, not as an error. Its `reason`
     * goes to the log alone, never to the body, and so names no address or token.
     */
    readonly flags: { expected?: boolean; reason?: string } = {},
  ) {
    super(message, status)
  }

  get expected() {
    return this.flags.expected === true
  }

  /** What a log line says of this error: the message, and the reason behind it when there is one. */
  get logLine() {
    return this.flags.reason ? `${this.message}: ${this.flags.reason}` : this.message
  }
}

export const unauthenticated = (message = 'Missing or invalid session') =>
  new ApiError(401, 'session.invalid', message)

/** The account turned on two-factor authentication and the session is below `aal2`. */
export const mfaRequired = () =>
  new ApiError(
    401,
    'session.mfa-required',
    'The session needs the code of two-factor authentication',
  )

/** Supabase Auth or its signing keys are out of reach: retry soon, the session stays. */
export const unavailable = (reason?: string) =>
  new ApiError(
    503,
    'server.unavailable',
    'Supabase Auth is unavailable',
    undefined,
    { 'Retry-After': '30' },
    { expected: true, reason },
  )

export const forbidden = (message = 'Insufficient permissions') =>
  new ApiError(403, 'permission.denied', message)

/** The tenant is suspended: off for everyone but the admin. */
export const tenantSuspended = () =>
  new ApiError(403, 'tenant.suspended', 'The convention is suspended')

export const notFound = (what: string) => new ApiError(404, 'request.not-found', `Unknown ${what}`)

/** The request did not come from the panel or the portal. */
export const originDenied = () =>
  new ApiError(
    403,
    'request.origin-denied',
    'The Origin of this request is not the panel or the portal',
  )
