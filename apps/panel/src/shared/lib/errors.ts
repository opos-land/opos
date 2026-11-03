import { type MessageDescriptor } from '@lingui/core'
import { errorMessage, unknownError } from '@opos/i18n/errors'
import { ORPCError } from '@orpc/client'
import { useSession } from './session-store'

export interface DescribedError {
  message: MessageDescriptor
  values: Record<string, string | number>
}

const isParams = (data: unknown): data is Record<string, string | number> =>
  typeof data === 'object' &&
  data !== null &&
  Object.values(data).every((value) => typeof value === 'string' || typeof value === 'number')

/**
 * The API's error body (PLAN.md 5) as an ORPCError with the code and its params; any other body
 * is left to oRPC.
 */
export function decodeApiError(body: unknown, status: number): ORPCError<string, unknown> | null {
  if (typeof body !== 'object' || body === null) return null
  const { code, params, message } = body as { code?: unknown; params?: unknown; message?: unknown }
  if (typeof code !== 'string') return null
  return new ORPCError(code, {
    status,
    message: typeof message === 'string' ? message : code,
    data: isParams(params) ? params : undefined,
  })
}

/** The error code of an API error, if it carries one. */
export function errorCode(error: unknown): string | undefined {
  if (error instanceof ORPCError) return String(error.code)
  return undefined
}

/**
 * `signedOut()` leaves `ready` with no account. Any other state keeps a session the refresh could
 * not settle (PLAN.md 8): a `401` shown then means "try again", not "sign in again".
 */
function sessionReallyEnded() {
  const { status, account } = useSession.getState()
  return status === 'ready' && account === null
}

/**
 * The message to show for an error, picked by its code from the catalog (PLAN.md 6). The English
 * `message` the API sends never reaches the screen; an unknown code, or an error
 * without one, shows the generic message.
 */
export function describeError(error: unknown): DescribedError {
  const code = errorCode(error)
  if (!code) return { message: unknownError, values: {} }
  if (code === 'session.invalid' && !sessionReallyEnded()) {
    return { message: errorMessage('server.unavailable'), values: {} }
  }
  const values = error instanceof ORPCError && isParams(error.data) ? error.data : {}
  return { message: errorMessage(code), values }
}

/** A plain `403`, as opposed to an anti-escalation refusal with a code of its own. */
export const isPermissionDenied = (error: unknown) =>
  error instanceof ORPCError && error.code === 'permission.denied'

export const isNotFound = (error: unknown) =>
  error instanceof ORPCError && error.code === 'request.not-found'

export const isSessionInvalid = (error: unknown) =>
  error instanceof ORPCError && error.code === 'session.invalid'
