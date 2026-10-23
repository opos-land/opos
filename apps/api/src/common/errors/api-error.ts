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
