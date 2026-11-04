import { type Account } from '@opos/contract'
import { type QueryClient } from '@tanstack/react-query'
import { accountApi } from '../../../shared/lib/api'
import { signedOut } from '../../../shared/lib/session'

export const accountOptions = () => accountApi.me.get.queryOptions()

export const updateAccountOptions = () => accountApi.me.update.mutationOptions()

export const deleteAccountOptions = () => accountApi.me.delete.mutationOptions()

/**
 * Puts what `PATCH /me` answered into the cached `GET /me`. The answer names no `signInMethods`,
 * which only the session's token knows, so it merges into what is cached.
 */
export function mergeSavedAccount(queryClient: QueryClient, saved: Account) {
  queryClient.setQueryData(accountOptions().queryKey, (cached) =>
    cached ? { ...cached, ...saved } : cached,
  )
}

/**
 * Forgets the session in this browser and tells the other tabs: after `DELETE /me` the account is
 * gone and the API has cleared the cookies, so there is no session left to end.
 */
export function forgetSession() {
  signedOut()
}
