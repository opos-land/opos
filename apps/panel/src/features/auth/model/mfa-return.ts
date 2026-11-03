import { safeRedirect } from './redirect'

/** The code screen of two-factor authentication (PLAN.md 7.12). */
export const MFA_PATH = '/auth/mfa'

/** The code screen with the path to return to once the code is right. */
export const mfaPath = (returnTo: string) =>
  returnTo === '/' ? MFA_PATH : `${MFA_PATH}?redirect=${encodeURIComponent(returnTo)}`

/**
 * Where the code screen returns to when an answer of `location` wants the code (PLAN.md 7.12): the
 * `?redirect=` target of a sign-in; `/auth/confirm` for a link, without its token, which is not
 * spent and must not reach a path; the page itself otherwise. Only a path inside the panel is a target.
 */
export function mfaReturnFor({ pathname, search }: { pathname: string; search: string }): string {
  if (pathname === '/login') {
    return safeRedirect(new URLSearchParams(search).get('redirect'))
  }
  if (pathname === '/auth/confirm') return pathname
  return safeRedirect(pathname + search)
}
