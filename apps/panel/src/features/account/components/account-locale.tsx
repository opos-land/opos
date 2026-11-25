import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { accountLocale, loadLocale } from '../../../shared/lib/i18n'
import { accountOptions } from '../api/account'

/** Once the account is known, the interface follows its language, Polish when it chose none. */
export function AccountLocale() {
  const account = useQuery(accountOptions())
  const locale = account.data ? accountLocale(account.data.locale) : null

  useEffect(() => {
    if (locale) void loadLocale(locale)
  }, [locale])

  return null
}
