import { Trans } from '@lingui/react/macro'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useSession } from '../../../shared/lib/session'
import { linkClass, LoadingView } from '../../../shared/ui'
import { AuthCard } from '../components/auth-card'
import { GoogleButton } from '../components/google-button'
import { SignInForm } from '../components/sign-in-form'
import { safeRedirect, withRedirect } from '../model/redirect'

export function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const status = useSession((state) => state.status)
  const session = useSession((state) => state.session)
  const returnTo = safeRedirect(params.get('redirect'))

  if (status === 'loading') return <LoadingView />
  if (session) return <Navigate to={returnTo} replace />

  return (
    <AuthCard title={<Trans>Sign in</Trans>}>
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
