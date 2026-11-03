import { accountApi } from '../../../shared/lib/api'
import { signedOut } from '../../../shared/lib/session'

export const accountOptions = () => accountApi.me.get.queryOptions()

export const updateAccountOptions = () => accountApi.me.update.mutationOptions()

export const deleteAccountOptions = () => accountApi.me.delete.mutationOptions()

export const accountKey = () => accountApi.me.get.key()

/**
 * Forgets the session in this browser and tells the other tabs: after `DELETE /me` the account is
 * gone and the API has cleared the cookies, so there is no session left to end.
 */
export function forgetSession() {
  signedOut()
}
