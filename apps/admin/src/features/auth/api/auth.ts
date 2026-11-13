import { accountClient } from '../../../shared/lib/api'
import { isMfaRequired, isSessionInvalid } from '../../../shared/lib/errors'
import { signedIn, signedOut } from '../../../shared/lib/session'
import { onSessionEnded, sessionUnavailable } from '../../../shared/lib/session-store'

// The feature's calls to the API's `auth` endpoints. Each one resolves to the error it failed
// with, or null. The admin application signs in by email, password and the code alone: the API
// serves its origin no sign-up, no Google sign-in, no password reset and no recovery code.

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

/**
 * The code of the authenticator app; the account is known once it is right. A code the API
 * accepted has changed the session, so a retry would be refused (`mfa.not-required`): whatever
 * fails afterwards is no failure of the code. Not knowing the account ends `unavailable`, whose
 * view asks again.
 */
export async function verifyCode(code: string): Promise<unknown> {
  const failure = await attempt(() => accountClient.auth.mfa.verify({ body: { code } }))
  if (failure) return failure
  let ended = false
  const stop = onSessionEnded(() => (ended = true))
  try {
    signedIn(await accountClient.me.get())
  } catch (error) {
    // The API link has already moved the session to the state the answer asked for: the code
    // screen, or signed out when the link's refresh found the session gone. A `session.invalid`
    // that stands without it is a refresh that could not be made: the account is not known.
    if (!isMfaRequired(error) && !(isSessionInvalid(error) && ended)) sessionUnavailable()
  } finally {
    stop()
  }
  return null
}

/** Ends this session only. */
export const signOut = () =>
  attempt(async () => {
    await accountClient.auth.signOut()
    signedOut()
  })
