/** A path inside the admin application to return to after sign-in; anything else goes to the start page. */
export function safeRedirect(value: string | null | undefined): string {
  if (!value?.startsWith('/')) return '/'
  // Resolved the way the browser resolves it: tabs and newlines dropped, a backslash read as a
  // slash, so '/\t/evil.test' is the other origin it would open.
  const { origin } = window.location
  const url = new URL(value, origin)
  // Dot segments collapse during resolution: '/.//evil.test' resolves to '//evil.test', which a
  // link renders as another origin.
  if (url.origin !== origin || url.pathname.startsWith('//')) return '/'
  return `${url.pathname}${url.search}${url.hash}`
}

export const loginPath = (returnTo: string) =>
  returnTo === '/' ? '/login' : `/login?redirect=${encodeURIComponent(returnTo)}`
