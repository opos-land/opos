import { AUTH_CALLBACK_PATH, panelUrl } from '../../../shared/config/routes'
import { auth } from '../../../shared/lib/auth'
import { activeLocale } from '../../../shared/lib/i18n'
import { throwawayPassword } from '../model/invitation-storage'

// The feature's calls to Supabase Auth (PLAN.md 7.5-7.7). Each one resolves to the AuthError it
// failed with, or null.

/** Where every link and the Google return come back to. */
const callbackUrl = () => panelUrl(AUTH_CALLBACK_PATH)

export async function signInWithPassword(credentials: { email: string; password: string }) {
  return (await auth.signInWithPassword(credentials)).error
}

/** Leaves for Google; on success the browser is already navigating away. */
export async function signInWithGoogle() {
  return (
    await auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl() } })
  ).error
}

/** An email sign-up with a throwaway password, chosen for real once confirmed (PLAN.md 7.7). */
export async function signUpWithEmail(email: string) {
  const { error } = await auth.signUp({
    email,
    password: throwawayPassword(),
    options: { data: { locale: activeLocale() }, emailRedirectTo: callbackUrl() },
  })
  return error
}

export async function sendPasswordLink(email: string) {
  return (await auth.resetPasswordForEmail(email, { redirectTo: callbackUrl() })).error
}

export async function exchangeCode(code: string) {
  return (await auth.exchangeCodeForSession(code)).error
}

export async function setPassword(password: string) {
  return (await auth.updateUser({ password })).error
}

/** Ends every session of the account but this one, as a password reset does (PLAN.md 7.6). */
export async function signOutOtherSessions() {
  return (await auth.signOut({ scope: 'others' })).error
}

export async function signOut() {
  return (await auth.signOut()).error
}
