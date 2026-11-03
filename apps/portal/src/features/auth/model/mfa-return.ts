import { SIGNED_IN_HOME } from '../../../shared/config/routes'
import { safeRedirect } from './redirect'

/** The code screen of two-factor authentication (PLAN.md 7.12). */
export const MFA_PATH = '/auth/mfa'

/** The code screen with the path to return to once the code is right. */
export const mfaPath = (returnTo: string) =>
  returnTo === SIGNED_IN_HOME ? MFA_PATH : `${MFA_PATH}?redirect=${encodeURIComponent(returnTo)}`

let named: string | null = null

/**
 * Runs `call`, whose `session.mfa-required` answer returns to `path` rather than to the page it
 * came from: the password confirmation of an account deletion returns to `/account?confirm=deletion`
 * (PLAN.md 7.12).
 */
export async function withMfaReturn<T>(path: string, call: () => Promise<T>): Promise<T> {
  const before = named
  named = path
  try {
    return await call()
  } finally {
    named = before
  }
}

/**
 * Where the code screen returns to when an answer of `location` wants the code (PLAN.md 7.12): the
 * `?redirect=` target of a sign-in; `/auth/confirm` for a link, without its token, which is not
 * spent and must not reach a path; the page itself otherwise. Only a path inside the portal is a target.
 */
export function mfaReturnFor({ pathname, search }: { pathname: string; search: string }): string {
  if (named) return named
  if (pathname === '/login' || pathname === '/register') {
    return safeRedirect(new URLSearchParams(search).get('redirect'))
  }
  if (pathname === '/auth/confirm') return pathname
  return safeRedirect(pathname + search)
}
