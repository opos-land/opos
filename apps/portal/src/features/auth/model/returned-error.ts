import { AuthError } from '@supabase/auth-js'

/**
 * The error Supabase Auth reports on a failed link, in the query or, for some flows, in the
 * fragment; null when the address carries none.
 */
export function returnedError(location: { search: string; hash: string }): AuthError | null {
  const query = new URLSearchParams(location.search)
  const fragment = new URLSearchParams(location.hash.slice(1))
  const code = query.get('error_code') ?? fragment.get('error_code')
  const error = query.get('error') ?? fragment.get('error')
  if (!code && !error) return null
  return new AuthError(error ?? 'auth error', undefined, code ?? undefined)
}

/** What a page opened from a link starts with: the code to exchange, or the reason it cannot. */
export function linkState(location: { search: string; hash: string }) {
  const code = new URLSearchParams(location.search).get('code')
  const error =
    returnedError(location) ??
    (code ? null : new AuthError('missing code', undefined, 'otp_expired'))
  return { code: error ? null : code, error }
}
