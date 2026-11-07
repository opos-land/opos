import { Navigate, useLocation } from 'react-router'
import { useSession } from '../../../shared/lib/session'
import { MFA_PATH, mfaPath, mfaReturnFor } from '../model/mfa-return'

/** The pages that would start a second sign-in over the pending one. */
const SIGN_IN_PATHS = ['/login', '/register']

/**
 * Whether the page would let someone sign in or redeem a link over a session that waits for its
 * code: the sign-in and registration pages, and the page of a link opened with no link in the
 * address. A link in the address is unspent until its button is pressed, so that page stays.
 */
function holdsSignIn({ pathname, search }: { pathname: string; search: string }) {
  if (SIGN_IN_PATHS.includes(pathname)) return true
  return pathname === '/auth/confirm' && !new URLSearchParams(search).has('token_hash')
}

/**
 * A session that waits for its code is led to the code screen from the pages that
 * would start another sign-in, keeping the path to return to; the screen's sign-out is how another
 * person gets in. Every other page renders as for a visitor with no account: pages that need a
 * session lead to the code screen themselves (`RequireSession`).
 */
export function MfaGate() {
  const status = useSession((state) => state.status)
  const location = useLocation()

  if (status !== 'mfa-required' || location.pathname === MFA_PATH || !holdsSignIn(location)) {
    return null
  }
  return <Navigate to={mfaPath(mfaReturnFor(location))} replace />
}
