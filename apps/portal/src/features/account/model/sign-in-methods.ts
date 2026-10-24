import { type User } from '@supabase/auth-js'

export interface SignInMethods {
  password: boolean
  google: boolean
}

/**
 * How the user can confirm it is them before deleting the account (PLAN.md 7.4): the password
 * again, Google again, or either. An account whose providers say nothing is offered the password.
 */
export function signInMethods(user: Pick<User, 'app_metadata' | 'identities'>): SignInMethods {
  const providers = new Set([
    ...(user.app_metadata.providers ?? []),
    ...(user.app_metadata.provider ? [user.app_metadata.provider] : []),
    ...(user.identities ?? []).map((identity) => identity.provider),
  ])
  const google = providers.has('google')
  return { password: providers.has('email') || !google, google }
}

/** The query parameter `/account` comes back with from a Google sign-in that confirms deletion. */
export const CONFIRM_DELETION_PARAM = 'confirm'
export const CONFIRM_DELETION_VALUE = 'deletion'
export const CONFIRM_DELETION_PATH = `/account?${CONFIRM_DELETION_PARAM}=${CONFIRM_DELETION_VALUE}`
