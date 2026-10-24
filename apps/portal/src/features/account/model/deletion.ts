import { errorCode } from '../../../shared/lib/errors'

/**
 * How a failed `DELETE /me` is explained (PLAN.md 9): the account is a convention's last head
 * organizer, the sign-in is too old, or anything else.
 */
export function deletionRefusal(error: unknown): 'last-head' | 'reauthenticate' | 'other' {
  const code = errorCode(error)
  if (code === 'membership.last-head') return 'last-head'
  if (code === 'session.reauthentication-required') return 'reauthenticate'
  return 'other'
}
