import { Trans } from '@lingui/react/macro'
import { errorCodes } from '@opos/contract'
import { ORPCError } from '@orpc/client'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useSession } from '../../../shared/lib/session'
import { ErrorMessage, linkClass, LoadingView } from '../../../shared/ui'
import { AuthCard } from '../components/auth-card'
import { GoogleButton } from '../components/google-button'
import { SignInForm } from '../components/sign-in-form'
import { safeRedirect, withRedirect } from '../model/redirect'

/**
 * The code a failed Google sign-in puts in `?error=` (PLAN.md 7.5), as an error the catalog can
 * show. A value that is no code of the API shows nothing: no text of the address reaches the page.
 */
function returnedError(value: string | null) {
  const code = errorCodes.find((known) => known === value)
  return code ? new ORPCError(code, { status: 400 }) : null
}

export function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const status = useSession((state) => state.status)
  const account = useSession((state) => state.account)
  const returnTo = safeRedirect(params.get('redirect'))

  if (status === 'loading') return <LoadingView />
  const returned = returnedError(params.get('error'))
  if (account && returned) {
    // A Google round trip started while signed in (confirming a deletion, re-authenticating) failed.
    return (
      <AuthCard title={<Trans>Sign in</Trans>}>
        <ErrorMessage error={returned} />
        <Link to={returnTo} className={linkClass}>
          <Trans>Continue</Trans>
        </Link>
      </AuthCard>
    )
  }
  if (account) return <Navigate to={returnTo} replace />

  return (
    <AuthCard title={<Trans>Sign in</Trans>}>
      <ErrorMessage error={returned} />
      <SignInForm
        returnTo={returnTo}
        onSignedIn={() => void navigate(returnTo, { replace: true })}
      />
      <Link to="/forgot-password" className={`${linkClass} text-sm`}>
        <Trans>Forgot your password?</Trans>
      </Link>
      <p className="text-muted text-center text-sm">
        <Trans>or</Trans>
      </p>
      <GoogleButton returnTo={returnTo} />
      <p className="text-sm">
        <Trans>
          No account yet?{' '}
          <Link to={withRedirect('/register', returnTo)} className={linkClass}>
            Create an account
          </Link>
        </Trans>
      </p>
    </AuthCard>
  )
}
