import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { applyTheme, signedOutTheme } from '../../../shared/lib/theme'
import { accountOptions } from '../api/theme'

/**
 * While an account is signed in, the interface follows its theme, or the system's when it has
 * none. What is shown stays until the account is known; once it is gone, the theme chosen in this
 * browser comes back.
 */
export function AccountTheme() {
  const account = useQuery(accountOptions())
  const theme = account.data ? account.data.theme : undefined

  useEffect(() => {
    if (theme !== undefined) applyTheme(theme)
  }, [theme])

  useEffect(() => () => applyTheme(signedOutTheme()), [])

  return null
}
