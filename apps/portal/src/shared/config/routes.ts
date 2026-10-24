/** The portal's own address for a path; Supabase Auth redirects back only to the allow-listed ones. */
export const portalUrl = (path: string) => new URL(path, window.location.origin).toString()

/** Where Supabase Auth returns with `?code=`: Google, email confirmation (PLAN.md 7.5). */
export const AUTH_CALLBACK_PATH = '/auth/callback'

/** Where the recovery link returns with `?code=` (PLAN.md 7.6). */
export const RESET_PASSWORD_PATH = '/reset-password'

export const PRIVACY_PATH = '/privacy'

/** Where a signed-in user lands when nothing else asked for a page. */
export const SIGNED_IN_HOME = '/account'
