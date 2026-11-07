import { Logger } from '@nestjs/common'
import { type ErrorCode } from '@opos/contract'
import {
  type AuthError,
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/auth-js'
import { ApiError, mfaRequired, unauthenticated, unavailable } from '../../common/errors/api-error'
import { NO_AUTH_ANSWER } from './supabase-auth.factory'

const logger = new Logger('AuthRefusal')

/** The session is gone: the client signs in again. */
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
 * becomes part of the API's body.
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
 * A `5xx` Supabase Auth answered itself, which carries its code, as opposed to a transport failure
 * or a gateway answering for a service that is down.
 */
export const isAnswered5xx = (error: unknown): error is Error =>
  isAuthError(error) &&
  (error.status ?? 0) >= 500 &&
  Boolean(error.code) &&
  error.code !== NO_AUTH_ANSWER

/**
 * A failure of a hook Supabase Auth calls, such as `hook_timeout_after_retry` for an unreachable
 * send-email hook. It answers `422`, not `5xx`, but like a failed send it depends on the address:
 * only an address Supabase Auth knows gets as far as the hook.
 */
export const isHookFailure = (error: unknown): error is AuthError =>
  isAuthError(error) && (error.code?.startsWith('hook_') ?? false)

/**
 * What Supabase Auth refused, as the error the API answers with: a dead session is
 * `401` `session.invalid`, `insufficient_aal` is `401` `session.mfa-required`,
 * `mfa_verification_failed` is `400` `mfa.code-invalid`, a code the contract lists keeps its status, an outage is `503` with
 * its reason for the log line, and anything else is a `500`, logged by its code and status.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (isAuthSessionMissingError(error)) return unauthenticated()
  // The message is callAuth's own: the status or the transport cause, never Supabase Auth's text.
  if (isAuthRetryableFetchError(error)) return unavailable(error.message)
  if (isAuthError(error)) {
    if ((error.status ?? 0) >= 500) return unavailable(error.message)
    if (error.code && SESSION_GONE.has(error.code)) return unauthenticated()
    // The session lives and only lacks the second factor, such as `updateUser` at `aal1`.
    if (error.code === 'insufficient_aal') return mfaRequired()
    // A wrong code or one outside its window; Supabase Auth answers it with a 422.
    if (error.code === 'mfa_verification_failed') {
      return new ApiError(400, 'mfa.code-invalid', 'The code is wrong or has expired.')
    }
    const message = error.code && Object.hasOwn(LISTED, error.code) ? LISTED[error.code] : undefined
    if (error.code && message) {
      return new ApiError(error.status ?? 400, `auth.${error.code}` as ErrorCode, message)
    }
  }
  // The text of a refusal can quote the address, so only its code and status reach the log.
  logger.error(
    isAuthError(error)
      ? `Supabase Auth refused with an unlisted code: ${error.code ?? 'none'}, status ${error.status ?? 'none'}`
      : error,
  )
  return new ApiError(500, 'server.error', 'Unexpected answer from Supabase Auth')
}
