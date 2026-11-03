import { Navigate, useLocation } from 'react-router'
import { useSession } from '../../../shared/lib/session'
import { MFA_PATH, mfaPath, mfaReturnFor } from '../model/mfa-return'

/**
 * Every `session.mfa-required` answer leads to the code screen, from whichever page it came
 * (PLAN.md 7.12), keeping the path to return to.
 */
export function MfaGate() {
  const status = useSession((state) => state.status)
  const location = useLocation()

  if (status !== 'mfa-required' || location.pathname === MFA_PATH) return null
  return <Navigate to={mfaPath(mfaReturnFor(location))} replace />
}
