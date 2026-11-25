import { type Account } from '@opos/contract'
import { type QueryClient } from '@tanstack/react-query'
import { accountApi } from '../../../shared/lib/api'

export const accountOptions = () => accountApi.me.get.queryOptions()

export const saveLanguageOptions = () => accountApi.me.update.mutationOptions()

/** Puts the language `PATCH /me` saved into the cached `GET /me`, which AccountLocale follows. */
export function mergeSavedLanguage(queryClient: QueryClient, saved: Pick<Account, 'locale'>) {
  queryClient.setQueryData(accountOptions().queryKey, (cached) =>
    cached ? { ...cached, locale: saved.locale } : cached,
  )
}
