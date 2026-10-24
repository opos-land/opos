import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { loadLocale, pickLocale } from '../shared/lib/i18n'
import { useSession } from '../shared/lib/session'
import { createQueryClient } from './query-client'

/**
 * Nothing of one account survives its sign-out, or another account's session replacing it (a
 * confirmation or recovery link for another address): no cached answer.
 */
export function AccountChangeCleanup({ onChange }: { onChange: () => void }) {
  useEffect(
    () =>
      useSession.subscribe((state, previous) => {
        const before = previous.session?.user.id
        if (before && before !== state.session?.user.id) onChange()
      }),
    [onChange],
  )
  return null
}

/**
 * A session that ends — sign-out, account deletion, a failed refresh — takes the account's language
 * with it: the signed-out portal follows the browser's languages again (PLAN.md 6, locale
 * detection).
 */
export function SignedOutLocale() {
  useEffect(
    () =>
      useSession.subscribe((state, previous) => {
        if (previous.session && !state.session) void loadLocale(pickLocale())
      }),
    [],
  )
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  const [onAccountChange] = useState(() => () => queryClient.clear())

  return (
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AccountChangeCleanup onChange={onAccountChange} />
        <SignedOutLocale />
        {children}
      </QueryClientProvider>
    </I18nProvider>
  )
}
