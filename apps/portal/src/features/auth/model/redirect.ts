import { SIGNED_IN_HOME } from '../../../shared/config/routes'

/**
 * A path inside the portal to return to after sign-in; anything else, an address on another
 * origin included, goes to the signed-in start page.
 */
export function safeRedirect(value: string | null | undefined): string {
  if (!value?.startsWith('/')) return SIGNED_IN_HOME
  // Resolved the way the browser resolves it: tabs and newlines dropped, a backslash read as a
  // slash, so '/\t/evil.test' is the other origin it would open.
  const { origin } = window.location
  const url = new URL(value, origin)
  if (url.origin !== origin) return SIGNED_IN_HOME
  return `${url.pathname}${url.search}${url.hash}`
}

/** A path with the page to return to once the visitor has signed in. */
export const withRedirect = (path: '/login' | '/register', returnTo: string) =>
  returnTo === SIGNED_IN_HOME ? path : `${path}?redirect=${encodeURIComponent(returnTo)}`

export const loginPath = (returnTo: string) => withRedirect('/login', returnTo)
