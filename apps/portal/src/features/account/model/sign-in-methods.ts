import { type SignInMethod } from '@opos/contract'

export interface SignInMethods {
  password: boolean
  google: boolean
}

/**
 * How the account can confirm it is the account before it is deleted (PLAN.md 9): the password
 * again, Google again, or either, as `GET /me` names its `signInMethods`. An account whose
 * methods say nothing is offered the password.
 */
export function signInMethods(methods: readonly SignInMethod[]): SignInMethods {
  const google = methods.includes('google')
  return { password: methods.includes('password') || !google, google }
}

/** The query parameter `/account` comes back with from a Google sign-in that confirms deletion. */
export const CONFIRM_DELETION_PARAM = 'confirm'
export const CONFIRM_DELETION_VALUE = 'deletion'
export const CONFIRM_DELETION_PATH = `/account?${CONFIRM_DELETION_PARAM}=${CONFIRM_DELETION_VALUE}`
