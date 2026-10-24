import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
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

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  const [onAccountChange] = useState(() => () => queryClient.clear())

  return (
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AccountChangeCleanup onChange={onAccountChange} />
        {children}
      </QueryClientProvider>
    </I18nProvider>
  )
}
