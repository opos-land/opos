import { type MessageDescriptor } from '@lingui/core'
import { errorMessage, unknownError } from '@opos/i18n/errors'
import { ORPCError } from '@orpc/client'
import { isAuthError } from '@supabase/auth-js'

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

/** The error code of an API or Supabase Auth error (`auth.<error_code>`), if it carries one. */
export function errorCode(error: unknown): string | undefined {
  if (error instanceof ORPCError) return String(error.code)
  if (isAuthError(error) && error.code) return `auth.${error.code}`
  return undefined
}

/**
 * The message to show for an error, picked by its code from the catalog (PLAN.md 6). The English
 * `message` the API or Supabase Auth sends never reaches the screen; an unknown code, or an error
 * without one, shows the generic message.
 */
export function describeError(error: unknown): DescribedError {
  const code = errorCode(error)
  if (!code) return { message: unknownError, values: {} }
  const values = error instanceof ORPCError && isParams(error.data) ? error.data : {}
  return { message: errorMessage(code), values }
}

/** A plain `403`, as opposed to an anti-escalation refusal with a code of its own. */
export const isPermissionDenied = (error: unknown) =>
  error instanceof ORPCError && error.code === 'permission.denied'

export const isNotFound = (error: unknown) =>
  error instanceof ORPCError && error.code === 'request.not-found'
