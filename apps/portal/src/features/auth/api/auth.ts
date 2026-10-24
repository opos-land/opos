import { AUTH_CALLBACK_PATH, portalUrl, RESET_PASSWORD_PATH } from '../../../shared/config/routes'
import { auth } from '../../../shared/lib/auth'
import { activeLocale } from '../../../shared/lib/i18n'
import { forgetAuthReturn, rememberAuthReturn } from '../model/auth-return'
import { type Registration } from '../model/registration'

// The feature's calls to Supabase Auth (PLAN.md 5.1, 7.5, 7.6). Each one resolves to the AuthError
// it failed with, or null. A call that comes back through /auth/callback takes the page to return
// to.

/** Where the Google return and the confirmation link come back to. */
const callbackUrl = () => portalUrl(AUTH_CALLBACK_PATH)

export async function signInWithPassword(credentials: { email: string; password: string }) {
  return (await auth.signInWithPassword(credentials)).error
}

/** Leaves for Google; on success the browser is already navigating away. */
export async function signInWithGoogle(returnTo: string) {
  rememberAuthReturn(returnTo)
  const { error } = await auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl() },
  })
  if (error) forgetAuthReturn()
  return error
}

/** Registration with a password; the account works once the link sent to the address is opened. */
export async function signUp(registration: Registration, returnTo: string) {
  const { email, password, firstName, lastName } = registration
  const { error } = await auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName, locale: activeLocale() },
      emailRedirectTo: callbackUrl(),
    },
  })
  if (!error) rememberAuthReturn(returnTo)
  return error
}

/** A new confirmation link, for a sign-in refused with `email_not_confirmed`. */
export async function resendConfirmation(email: string, returnTo: string) {
  const { error } = await auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: callbackUrl() },
  })
  if (!error) rememberAuthReturn(returnTo)
  return error
}

/** Supabase Auth answers an unknown address as it answers a known one (PLAN.md 7.6). */
export async function sendPasswordReset(email: string) {
  const { error } = await auth.resetPasswordForEmail(email, {
    redirectTo: portalUrl(RESET_PASSWORD_PATH),
  })
  return error
}

export async function exchangeCode(code: string) {
  return (await auth.exchangeCodeForSession(code)).error
}

export async function setPassword(password: string) {
  return (await auth.updateUser({ password })).error
}

/** Ends every session of the account but this one (PLAN.md 7.6). */
export async function signOutOtherSessions() {
  return (await auth.signOut({ scope: 'others' })).error
}

export async function signOut() {
  return (await auth.signOut()).error
}
