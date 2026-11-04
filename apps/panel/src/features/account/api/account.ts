import { type Account } from '@opos/contract'
import { type QueryClient } from '@tanstack/react-query'
import { accountApi } from '../../../shared/lib/api'

export const accountOptions = () => accountApi.me.get.queryOptions()

export const updateAccountOptions = () => accountApi.me.update.mutationOptions()

/**
 * Puts what `PATCH /me` answered into the cached `GET /me`. The answer names no `signInMethods`,
 * which only the session's token knows, so it merges into what is cached.
 */
export function mergeSavedAccount(queryClient: QueryClient, saved: Account) {
  queryClient.setQueryData(accountOptions().queryKey, (cached) =>
    cached ? { ...cached, ...saved } : cached,
  )
}
