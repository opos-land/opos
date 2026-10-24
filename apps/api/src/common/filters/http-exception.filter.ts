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

/** Database constraints whose violation is the client's business, by constraint name. */
const constraintErrors: Record<
  string,
  { status: number; code: ErrorCode; message: string; params?: ApiErrorBody['params'] }
> = {
  editions_ends_after_start: {
    status: 400,
    code: 'request.invalid',
    message: 'endsAt must be after startsAt',
    params: { field: 'endsAt' },
  },
  tenant_memberships_head_never_expires: {
    status: 400,
    code: 'request.invalid',
    message: 'A head membership never expires',
    params: { field: 'expiresAt' },
  },
  tenant_memberships_at_least_one_head: {
    status: 409,
    code: 'membership.last-head',
    message: 'A tenant must keep at least one head',
  },
  editions_tenant_slug_unique: {
    status: 409,
    code: 'edition.slug-taken',
    message: 'The tenant already has an edition with this slug',
  },
  tenants_at_least_one_head: {
    status: 409,
    code: 'membership.last-head',
    message: 'A tenant must be created with a head',
  },
}

/** The Postgres error behind an exception; drizzle wraps query errors in `cause`. */
function postgresConstraint(exception: unknown): string | undefined {
  let current: unknown = exception
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const name = (current as { constraint_name?: unknown }).constraint_name
    if (typeof name === 'string') return name
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/** Maps anything thrown while handling a request onto the error schema of PLAN.md 5. */
export function toErrorResponse(exception: unknown): { status: number; body: ApiErrorBody } {
  // Deferred constraint triggers fire at COMMIT, after the handler already chose a 2xx.
  const constraint = postgresConstraint(exception)
  const known = constraint ? constraintErrors[constraint] : undefined
  if (known) {
    const { status, code, message, params } = known
    return { status, body: { code, params, message } }
  }

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
    // A 5xx message may carry internals (ts-rest puts the zod error there); only the log gets it.
    const message = status >= 500 ? 'Internal server error' : exception.message
    return { status, body: { code: codeByStatus(status), message } }
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
