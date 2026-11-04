import { safeRedirect } from './redirect'

/**
 * The address the Google button navigates to (PLAN.md 7.5): the API starts the sign-in for the
 * panel and returns to `returnTo`, which it judges again as a path of the panel.
 */
export function googleSignInUrl(apiUrl: string, returnTo: string) {
  const url = new URL('/auth/google', apiUrl)
  url.searchParams.set('app', 'panel')
  url.searchParams.set('redirect', safeRedirect(returnTo))
  return url.toString()
}
