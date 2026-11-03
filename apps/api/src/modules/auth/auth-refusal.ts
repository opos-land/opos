import { Logger } from '@nestjs/common'
import { type ErrorCode } from '@opos/contract'
import {
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/auth-js'
import { ApiError, unauthenticated, unavailable } from '../../common/errors/api-error'

const logger = new Logger('AuthRefusal')

/** The session is gone: the client signs in again (PLAN.md 5.1). */
const SESSION_GONE = new Set([
  'session_not_found',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
  'user_not_found',
])

/** Codes of Supabase Auth that reach the client as `auth.<error_code>` with its status. */
const LISTED: ReadonlySet<string> = new Set([
  'email_not_confirmed',
  'invalid_credentials',
  'weak_password',
  'same_password',
  'otp_expired',
  'email_address_invalid',
  'over_email_send_rate_limit',
  'over_request_rate_limit',
])

/**
 * What Supabase Auth refused, as the error the API answers with (PLAN.md 5.1): a dead session is
 * `401` `session.invalid`, a code the contract lists keeps its status, an outage is `503`, and
 * anything else is a logged `500`.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (isAuthSessionMissingError(error)) return unauthenticated()
  if (isAuthRetryableFetchError(error)) return unavailable()
  if (isAuthError(error)) {
    if ((error.status ?? 0) >= 500) return unavailable()
    if (error.code && SESSION_GONE.has(error.code)) return unauthenticated()
    if (error.code && LISTED.has(error.code)) {
      return new ApiError(error.status ?? 400, `auth.${error.code}` as ErrorCode, error.message)
    }
  }
  logger.error(error)
  return new ApiError(500, 'server.error', 'Unexpected answer from Supabase Auth')
}
