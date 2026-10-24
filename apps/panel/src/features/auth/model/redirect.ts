/** A path inside the panel to return to after sign-in; anything else goes to the start page. */
export function safeRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/'
  }
  return value
}

export const loginPath = (returnTo: string) =>
  returnTo === '/' ? '/login' : `/login?redirect=${encodeURIComponent(returnTo)}`
