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
 * Asks `GET /me` again and shows the answer in the account page and in the session, so the card
 * and `mfaEnabled` agree without a reload.
 */
export async function refreshAccount(queryClient: QueryClient) {
  const account = await accountClient.me.get()
  queryClient.setQueryData(accountOptions().queryKey, account)
  useSession.setState({ account })
}
