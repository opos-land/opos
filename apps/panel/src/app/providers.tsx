import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { setMemberships } from '../features/tenants'
import { useSession } from '../shared/lib/session'
import { createQueryClient } from './query-client'

/** Nothing of one account survives its sign-out: no cached answer, no permissions. */
function SignOutCleanup({ onSignOut }: { onSignOut: () => void }) {
  useEffect(
    () =>
      useSession.subscribe((state, previous) => {
        if (previous.session && !state.session) onSignOut()
      }),
    [onSignOut],
  )
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  const [onSignOut] = useState(() => () => {
    queryClient.clear()
    setMemberships(null)
  })

  return (
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SignOutCleanup onSignOut={onSignOut} />
        {children}
      </QueryClientProvider>
    </I18nProvider>
  )
}
