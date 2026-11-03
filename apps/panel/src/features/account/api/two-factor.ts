import { type QueryClient } from '@tanstack/react-query'
import { accountClient } from '../../../shared/lib/api'
import { useSession } from '../../../shared/lib/session'
import { accountOptions } from './account'

// The calls of the two-factor card (PLAN.md 7.12). They are plain calls, not TanStack mutations: a
// mutation keeps its answer in the mutation cache, and the answers here are a secret and the
// recovery codes, which must not outlive the view.

export const enrollTwoFactor = () => accountClient.auth.mfa.enroll()

export const enableTwoFactor = (factorId: string, code: string) =>
  accountClient.auth.mfa.enable({ body: { factorId, code } })

export const disableTwoFactor = () => accountClient.auth.mfa.disable()

/**
 * What the API just answered about `mfaEnabled` goes into the account page and the session at
 * once; `GET /me` is asked afterwards and its answer replaces the whole account. A `GET /me` that
 * fails therefore leaves the card right, not stale, and rejects for the caller to see.
 */
export async function refreshAccount(queryClient: QueryClient, mfaEnabled: boolean) {
  const key = accountOptions().queryKey
  queryClient.setQueryData(key, (cached) => (cached ? { ...cached, mfaEnabled } : cached))
  const shown = useSession.getState().account
  if (shown) useSession.setState({ account: { ...shown, mfaEnabled } })

  const account = await accountClient.me.get()
  queryClient.setQueryData(key, account)
  useSession.setState({ account })
}
