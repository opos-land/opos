import { type Account } from '@opos/contract'
import { type QueryClient } from '@tanstack/react-query'
import { accountApi } from '../../../shared/lib/api'

export const accountOptions = () => accountApi.me.get.queryOptions()

export const saveThemeOptions = () => accountApi.me.update.mutationOptions()

/** Puts the theme `PATCH /me` saved into the cached `GET /me`, which AccountTheme shows. */
export function mergeSavedTheme(queryClient: QueryClient, saved: Account) {
  queryClient.setQueryData(accountOptions().queryKey, (cached) =>
    cached ? { ...cached, theme: saved.theme } : cached,
  )
}
