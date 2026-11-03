import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { startSession, useSession } from '../../../shared/lib/session'
import { LoadingView, UnavailableView } from '../../../shared/ui'
import { loginPath } from '../model/redirect'

/**
 * A page for a signed-in account: a loading view while the account is asked for, never the sign-in
 * screen (PLAN.md 9); an offer to try again when the API could not be reached, which signs nobody
 * out; the sign-in screen once it is clear there is no session.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useSession((state) => state.status)
  const account = useSession((state) => state.account)
  const location = useLocation()

  if (status === 'loading') return <LoadingView />
  if (status === 'unavailable') return <UnavailableView onRetry={() => void startSession()} />
  if (!account) return <Navigate to={loginPath(location.pathname + location.search)} replace />
  return children
}
