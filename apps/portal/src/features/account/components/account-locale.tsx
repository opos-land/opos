import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { loadLocale, pickLocale } from '../../../shared/lib/i18n'
import { accountOptions } from '../api/account'

/** Once the account is known, the interface follows its language (PLAN.md 6, locale detection). */
export function AccountLocale() {
  const account = useQuery(accountOptions())
  const locale = account.data ? pickLocale(account.data.locale) : null

  useEffect(() => {
    if (locale) void loadLocale(locale)
  }, [locale])

  return null
}
