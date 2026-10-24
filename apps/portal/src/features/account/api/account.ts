import { accountApi } from '../../../shared/lib/api'
import { auth } from '../../../shared/lib/auth'

export const accountOptions = () => accountApi.me.get.queryOptions()

export const updateAccountOptions = () => accountApi.me.update.mutationOptions()

export const deleteAccountOptions = () => accountApi.me.delete.mutationOptions()

export const accountKey = () => accountApi.me.get.key()

/**
 * Forgets the session in this browser only: after `DELETE /me` the user is gone, and Supabase
 * Auth has no session left to end.
 */
export async function forgetSession() {
  await auth.signOut({ scope: 'local' })
}
