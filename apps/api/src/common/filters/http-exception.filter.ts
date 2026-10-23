import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common'
import { type ApiError as ApiErrorBody, type ErrorCode } from '@opos/contract'
import { RequestValidationError } from '@ts-rest/nest'
import { type ZodError } from 'zod'
import { ApiError } from '../errors/api-error'

const codeByStatus = (status: number): ErrorCode => {
  if (status === 401) return 'session.invalid'
  if (status === 403) return 'permission.denied'
  if (status === 404) return 'request.not-found'
  if (status === 429) return 'request.rate-limited'
  if (status >= 500) return 'server.error'
  return 'request.invalid'
}

/** Maps anything thrown while handling a request onto the error schema of PLAN.md 5. */
export function toErrorResponse(exception: unknown): { status: number; body: ApiErrorBody } {
  if (exception instanceof ApiError) {
    const { code, params, message } = exception
    return { status: exception.getStatus(), body: { code, params, message } }
  }
  if (exception instanceof RequestValidationError) {
    const errors: (ZodError | null)[] = [
      exception.body,
      exception.query,
      exception.pathParams,
      exception.headers,
    ]
    const issue = errors.flatMap((error) => error?.issues ?? [])[0]
    // An unknown key has an empty path; the key itself is the field.
    const field =
      issue?.code === 'unrecognized_keys' ? issue.keys[0] : issue?.path.join('.') || undefined
    return {
      status: 400,
      body: {
        code: 'request.invalid',
        params: field ? { field } : undefined,
        message: issue?.message ?? 'Invalid request',
      },
    }
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus()
    return { status, body: { code: codeByStatus(status), message: exception.message } }
  }
  // Errors from Express itself, e.g. a body that is not valid JSON, carry their own 4xx status.
  const status = (exception as { status?: unknown } | null)?.status
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return { status, body: { code: codeByStatus(status), message: 'Invalid request' } }
  }
  return { status: 500, body: { code: 'server.error', message: 'Internal server error' } }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const { status, body } = toErrorResponse(exception)
    if (status >= 500) this.logger.error(exception)
    host
      .switchToHttp()
      .getResponse<{ status(code: number): { json(body: unknown): void } }>()
      .status(status)
      .json(body)
  }
}
