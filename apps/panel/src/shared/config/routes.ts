/** The panel's own address for a path; Supabase Auth redirects back only to the allow-listed ones. */
export const panelUrl = (path: string) => new URL(path, window.location.origin).toString()

/** Where Supabase Auth returns with `?code=`: Google, email confirmation, password link (PLAN.md 7.5). */
export const AUTH_CALLBACK_PATH = '/auth/callback'
