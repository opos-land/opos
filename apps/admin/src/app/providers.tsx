import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { useSession } from '../shared/lib/session'
import { toast, Toaster } from '../shared/ui'
import { createQueryClient } from './query-client'

/**
 * Nothing of one account survives its sign-out, or another account's session replacing it, here
 * or in another tab of the admin application: no cached answer, no notification.
 */
export function AccountChangeCleanup({ onChange }: { onChange: () => void }) {
  useEffect(
    () =>
      useSession.subscribe((state, previous) => {
        const before = previous.account?.id
        if (before && before !== state.account?.id) onChange()
      }),
    [onChange],
  )
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  const [onAccountChange] = useState(() => () => {
    queryClient.clear()
    toast.close()
  })

  return (
    <I18nProvider i18n={i18n}>
      {/* The notifications of the writes' outcomes (query-client.ts). */}
      <Toaster>
        <QueryClientProvider client={queryClient}>
          <AccountChangeCleanup onChange={onAccountChange} />
          {children}
        </QueryClientProvider>
      </Toaster>
    </I18nProvider>
  )
}
