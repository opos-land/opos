import { type verifySchema } from '@opos/contract'
import { type z } from 'zod'
import { env } from '../../../shared/config/env'
import { accountClient } from '../../../shared/lib/api'
import { isMfaRequired } from '../../../shared/lib/errors'
import { signedIn, signedOut } from '../../../shared/lib/session'
import { sessionUnavailable } from '../../../shared/lib/session-store'
import { rememberAuthReturn } from '../model/auth-return'
import { googleSignInUrl } from '../model/google-url'

// The feature's calls to the API's `auth` endpoints (PLAN.md 5.1). Each one resolves to the error
// it failed with, or null. A call that sends a link takes the page to return to once it is opened.

/** The link of an email: its `token_hash` and `type`. */
export type VerifyLink = z.infer<typeof verifySchema>

async function attempt(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call()
    return null
  } catch (error) {
    return error
  }
}

export const signInWithPassword = (body: { email: string; password: string }) =>
  attempt(async () => signedIn(await accountClient.auth.signIn({ body })))

/** Leaves for Google: a navigation of the browser, not a request of the API link (PLAN.md 7.5). */
export function signInWithGoogle(returnTo: string) {
  window.location.assign(googleSignInUrl(env.VITE_API_URL, returnTo))
}

/** An email sign-up takes no password: the invitee chooses it once the link proves the address. */
export const signUpWithEmail = (email: string, returnTo: string) =>
  attempt(async () => {
    await accountClient.auth.signUp({ body: { email } })
    rememberAuthReturn(returnTo)
  })

export const resendConfirmation = (email: string, returnTo: string) =>
  attempt(async () => {
    await accountClient.auth.resend({ body: { email } })
    rememberAuthReturn(returnTo)
  })

export const sendPasswordLink = (email: string, returnTo: string) =>
  attempt(async () => {
    await accountClient.auth.passwordForgot({ body: { email } })
    rememberAuthReturn(returnTo)
  })

/** The button of `/auth/confirm`: redeems the link of an email and signs in (PLAN.md 5.1). */
export const verifyLink = (body: VerifyLink) =>
  attempt(async () => signedIn(await accountClient.auth.verify({ body })))

/**
 * A code the API accepted has changed the session, so a retry would be refused (`mfa.not-required`):
 * whatever fails afterwards is no failure of the code. Not knowing the account ends `unavailable`,
 * whose view asks again (PLAN.md 7.12).
 */
async function afterRightCode(call: () => Promise<unknown>): Promise<unknown> {
  const failure = await attempt(call)
  if (failure) return failure
  try {
    signedIn(await accountClient.me.get())
  } catch (error) {
    // The API link has already moved the session to the state the answer asked for.
    if (!isMfaRequired(error)) sessionUnavailable()
  }
  return null
}

/** The code of the authenticator app; the account is known once it is right (PLAN.md 7.12). */
export const verifyCode = (code: string) =>
  afterRightCode(() => accountClient.auth.mfa.verify({ body: { code } }))

/** A recovery code: two-factor authentication is off afterwards, and so is `mfaEnabled` (PLAN.md 7.12). */
export const recoverWithCode = (code: string) =>
  afterRightCode(() => accountClient.auth.mfa.recover({ body: { code } }))

/** Saves the password and ends the account's other sessions (PLAN.md 7.6). */
export const setPassword = (password: string) =>
  attempt(() => accountClient.auth.password({ body: { password } }))

/** Ends this session only (PLAN.md 5.1). */
export const signOut = () =>
  attempt(async () => {
    await accountClient.auth.signOut()
    signedOut()
  })
