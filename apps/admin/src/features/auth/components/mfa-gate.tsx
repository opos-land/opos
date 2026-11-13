import { Navigate, useLocation } from 'react-router'
import { useSession } from '../../../shared/lib/session'
import { MFA_PATH, mfaPath, mfaReturnFor } from '../model/mfa-return'

/**
 * A session that waits for its code is led from the sign-in page, which would start another
 * sign-in over it, to the code screen, keeping the path to return to; the screen's sign-out is
 * how another person gets in. Every other page needs a session and leads there itself
 * (`RequireSession`).
 */
export function MfaGate() {
  const status = useSession((state) => state.status)
  const location = useLocation()

  if (
    status !== 'mfa-required' ||
    location.pathname === MFA_PATH ||
    location.pathname !== '/login'
  ) {
    return null
  }
  return <Navigate to={mfaPath(mfaReturnFor(location))} replace />
}
