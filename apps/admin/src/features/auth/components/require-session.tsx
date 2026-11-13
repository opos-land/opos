import { type ReactNode, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router'
import { startSession, useSession } from '../../../shared/lib/session'
import { LoadingView, UnavailableView } from '../../../shared/ui'
import { mfaPath, mfaReturnFor } from '../model/mfa-return'
import { loginPath } from '../model/redirect'
import { isAnotherAccount, rememberShownAccount } from '../model/shown-account'

/**
 * A page for signed-in members: a loading view while the account is asked for, never the sign-in
 * screen; an offer to try again when the API could not be reached, which signs nobody
 * out; the code screen for a session waiting for its code, which shows no account data; the
 * sign-in screen once it is clear there is no session. The page belongs to the account the tab
 * showed before: another account, signed in here or in another tab, starts from `/`.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useSession((state) => state.status)
  const account = useSession((state) => state.account)
  const location = useLocation()
  const anotherAccount = account !== null && isAnotherAccount(account.id)

  useEffect(() => {
    if (account) rememberShownAccount(account.id)
  }, [account])

  if (status === 'loading') return <LoadingView />
  if (status === 'unavailable') return <UnavailableView onRetry={() => void startSession()} />
  if (status === 'mfa-required') return <Navigate to={mfaPath(mfaReturnFor(location))} replace />
  if (!account) return <Navigate to={loginPath(location.pathname + location.search)} replace />
  if (anotherAccount && location.pathname !== '/') return <Navigate to="/" replace />
  return children
}
