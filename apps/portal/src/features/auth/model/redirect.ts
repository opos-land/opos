import { SIGNED_IN_HOME } from '../../../shared/config/routes'

/**
 * A path inside the portal to return to after sign-in; anything else, an address on another
 * origin included, goes to the signed-in start page.
 */
export function safeRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return SIGNED_IN_HOME
  }
  return value
}

/** A path with the page to return to once the visitor has signed in. */
export const withRedirect = (path: '/login' | '/register', returnTo: string) =>
  returnTo === SIGNED_IN_HOME ? path : `${path}?redirect=${encodeURIComponent(returnTo)}`

export const loginPath = (returnTo: string) => withRedirect('/login', returnTo)
