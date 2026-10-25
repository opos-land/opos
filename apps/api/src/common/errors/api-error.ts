import { HttpException } from '@nestjs/common'
import { type ApiError as ApiErrorBody, type ErrorCode } from '@opos/contract'

/** An error the client handles by its `code` (PLAN.md 5); the filter turns it into the error body. */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly params?: ApiErrorBody['params'],
    /** Response headers that go out with the error, e.g. `Retry-After` on a 429. */
    readonly headers?: Record<string, string>,
    /** An expected 5xx, such as a busy tenant, is logged as a warning, not as an error. */
    readonly flags: { expected?: boolean } = {},
  ) {
    super(message, status)
  }

  get expected() {
    return this.flags.expected === true
  }
}

export const unauthenticated = (message = 'Missing or invalid session') =>
  new ApiError(401, 'session.invalid', message)

export const forbidden = (message = 'Insufficient permissions') =>
  new ApiError(403, 'permission.denied', message)

export const notFound = (what: string) => new ApiError(404, 'request.not-found', `Unknown ${what}`)
