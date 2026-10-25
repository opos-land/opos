import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common'
import { type ApiError as ApiErrorBody, type ErrorCode } from '@opos/contract'
import { ORPCError, ValidationError } from '@orpc/server'
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
  editions_slug_format: {
    status: 400,
    code: 'request.invalid',
    message: 'slug may contain only lowercase letters, digits and hyphens, 1 to 40 characters',
    params: { field: 'slug' },
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
  tenant_memberships_account_tenant_unique: {
    status: 409,
    code: 'member.exists',
    message: 'The account already holds a membership in this tenant',
  },
  accepted_invitations_tenant_jti_unique: {
    status: 409,
    code: 'invitation.used',
    message: 'The invitation has been accepted already',
  },
  tenants_at_least_one_head: {
    status: 409,
    code: 'membership.last-head',
    message: 'A tenant must be created with a head',
  },
}

/**
 * The Postgres error behind an exception: drizzle wraps query errors in `cause`, and a Postgres
 * error is the one that carries a `severity`, so a Node error such as EPIPE is never taken.
 */
function postgresError(
  exception: unknown,
): { code?: unknown; constraint_name?: unknown } | undefined {
  let current: unknown = exception
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    if (typeof (current as { severity?: unknown }).severity === 'string') {
      return current
    }
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/** The constraint a Postgres error behind an exception names. */
export function postgresConstraint(exception: unknown): string | undefined {
  const name = postgresError(exception)?.constraint_name
  return typeof name === 'string' ? name : undefined
}

/** The SQLSTATE of a Postgres error behind an exception. */
export function postgresCode(exception: unknown): string | undefined {
  const code = postgresError(exception)?.code
  return typeof code === 'string' ? code : undefined
}

/**
 * The first invalid field of an input oRPC refused. Every route takes the detailed input, so a path
 * starts with params, query or body and the field is below it; an unknown key names itself.
 */
function validationError(error: ValidationError): ApiErrorBody {
  const issue = error.issues[0] as
    { message: string; code?: string; keys?: string[]; path?: readonly unknown[] } | undefined
  const path = (issue?.path ?? [])
    .slice(1)
    .map((segment) =>
      typeof segment === 'object' && segment !== null && 'key' in segment
        ? String(segment.key)
        : String(segment),
    )
  const field = issue?.code === 'unrecognized_keys' ? issue.keys?.[0] : path.join('.') || undefined
  return {
    code: 'request.invalid',
    params: field ? { field } : undefined,
    message: issue?.message ?? 'Invalid request',
  }
}

/** Maps anything thrown while handling a request onto the error schema of PLAN.md 5. */
export function toErrorResponse(exception: unknown): {
  status: number
  body: ApiErrorBody
  headers?: Record<string, string>
} {
  // Deferred constraint triggers fire at COMMIT, after the handler already chose a 2xx.
  const constraint = postgresConstraint(exception)
  const known = constraint ? constraintErrors[constraint] : undefined
  if (known) {
    const { status, code, message, params } = known
    return { status, body: { code, params, message } }
  }

  if (exception instanceof ApiError) {
    const { code, params, message, headers } = exception
    return { status: exception.getStatus(), body: { code, params, message }, headers }
  }
  if (exception instanceof ORPCError) {
    const cause: unknown = exception.cause
    if (exception.code === 'BAD_REQUEST' && cause instanceof ValidationError) {
      return { status: 400, body: validationError(cause) }
    }
    // A 5xx carries internals (an output that failed its schema, for one); only the log gets them.
    const status = exception.status
    const message = status >= 500 ? 'Internal server error' : exception.message
    return { status, body: { code: codeByStatus(status), message } }
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus()
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
    const response = host.switchToHttp().getResponse<{
      headersSent: boolean
      writableEnded: boolean
      destroy(): void
      setHeader(name: string, value: string): void
      status(code: number): { json(body: unknown): void }
    }>()
    // The response is out already. Nest replies once more after oRPC has answered, which throws
    // ERR_HTTP_HEADERS_SENT on a 204; anything else is a real error after the response started.
    if (response.headersSent) {
      if ((exception as { code?: unknown } | null)?.code !== 'ERR_HTTP_HEADERS_SENT') {
        this.logger.error(exception)
      }
      if (!response.writableEnded) response.destroy()
      return
    }
    const { status, body, headers } = toErrorResponse(exception)
    if (status >= 500) {
      if (exception instanceof ApiError && exception.expected) this.logger.warn(exception.message)
      else this.logger.error(exception)
    }
    for (const [name, value] of Object.entries(headers ?? {})) response.setHeader(name, value)
    response.status(status).json(body)
  }
}
