import { HttpException } from '@nestjs/common'
import { type ApiError as ApiErrorBody, type ErrorCode } from '@opos/contract'

/** An error the client handles by its `code` (PLAN.md 5); the filter turns it into the error body. */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly params?: ApiErrorBody['params'],
  ) {
    super(message, status)
  }
}

export const unauthenticated = (message = 'Missing or invalid session') =>
  new ApiError(401, 'session.invalid', message)

export const forbidden = (message = 'Insufficient permissions') =>
  new ApiError(403, 'permission.denied', message)

export const notFound = (what: string) => new ApiError(404, 'request.not-found', `Unknown ${what}`)
