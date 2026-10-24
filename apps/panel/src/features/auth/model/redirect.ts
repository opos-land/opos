/** A path inside the panel to return to after sign-in; anything else goes to the start page. */
export function safeRedirect(value: string | null | undefined): string {
  if (!value?.startsWith('/')) return '/'
  // Resolved the way the browser resolves it: tabs and newlines dropped, a backslash read as a
  // slash, so '/\t/evil.test' is the other origin it would open.
  const { origin } = window.location
  const url = new URL(value, origin)
  if (url.origin !== origin) return '/'
  return `${url.pathname}${url.search}${url.hash}`
}

export const loginPath = (returnTo: string) =>
  returnTo === '/' ? '/login' : `/login?redirect=${encodeURIComponent(returnTo)}`
