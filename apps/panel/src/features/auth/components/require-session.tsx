import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from '../../../shared/lib/session'
import { LoadingView } from '../../../shared/ui'
import { loginPath } from '../model/redirect'

/**
 * A page for signed-in members: a loading view while the stored session is restored, never the
 * sign-in screen (PLAN.md 8), and the sign-in screen once it is clear there is no session.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useSession((state) => state.status)
  const session = useSession((state) => state.session)
  const location = useLocation()

  if (status === 'loading') return <LoadingView />
  if (!session) return <Navigate to={loginPath(location.pathname + location.search)} replace />
  return children
}
