import { type SignInMethod } from '@opos/contract'

export interface SignInMethods {
  password: boolean
  google: boolean
}

/**
 * How the account can confirm it is the account before it turns two-factor authentication on or
 * off (PLAN.md 8): the password again, Google again, or either, as `GET /me` names its
 * `signInMethods`. An account whose methods say nothing is offered the password.
 */
export function signInMethods(methods: readonly SignInMethod[]): SignInMethods {
  const google = methods.includes('google')
  return { password: methods.includes('password') || !google, google }
}
