import { Logger } from '@nestjs/common'
import { type ErrorCode } from '@opos/contract'
import {
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/auth-js'
import { ApiError, mfaRequired, unauthenticated, unavailable } from '../../common/errors/api-error'

const logger = new Logger('AuthRefusal')

/** The session is gone: the client signs in again (PLAN.md 5.1). */
const SESSION_GONE = new Set([
  'session_not_found',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
  'user_not_found',
])

/**
 * Codes of Supabase Auth that reach the client as `auth.<error_code>` with its status, each with
 * the English message of OPOS's own the error body carries: the wording of a third party never
 * becomes part of the API's body (PLAN.md 5).
 */
const LISTED: Readonly<Record<string, string>> = {
  email_not_confirmed: 'The email address is not confirmed.',
  invalid_credentials: 'The email address or the password is wrong.',
  weak_password: 'The password is too weak.',
  same_password: 'The new password equals the current one.',
  otp_expired: 'The link has expired or has been used.',
  email_address_invalid: 'The email address is not accepted.',
  over_email_send_rate_limit: 'Too many emails were requested.',
  over_request_rate_limit: 'Too many requests reached the sign-in service.',
}

/**
 * What Supabase Auth refused, as the error the API answers with (PLAN.md 5.1): a dead session is
 * `401` `session.invalid`, `insufficient_aal` is `401` `session.mfa-required`,
 * `mfa_verification_failed` is `400` `mfa.code-invalid`, a code the contract lists keeps its status, an outage is `503`, and
 * anything else is a logged `500`.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (isAuthSessionMissingError(error)) return unauthenticated()
  if (isAuthRetryableFetchError(error)) return unavailable()
  if (isAuthError(error)) {
    if ((error.status ?? 0) >= 500) return unavailable()
    if (error.code && SESSION_GONE.has(error.code)) return unauthenticated()
    // The session lives and only lacks the second factor, such as `updateUser` at `aal1`.
    if (error.code === 'insufficient_aal') return mfaRequired()
    // A wrong code or one outside its window; Supabase Auth answers it with a 422 (PLAN.md 7.12).
    if (error.code === 'mfa_verification_failed') {
      return new ApiError(400, 'mfa.code-invalid', 'The code is wrong or has expired.')
    }
    const message = error.code && Object.hasOwn(LISTED, error.code) ? LISTED[error.code] : undefined
    if (error.code && message) {
      return new ApiError(error.status ?? 400, `auth.${error.code}` as ErrorCode, message)
    }
  }
  logger.error(error)
  return new ApiError(500, 'server.error', 'Unexpected answer from Supabase Auth')
}
