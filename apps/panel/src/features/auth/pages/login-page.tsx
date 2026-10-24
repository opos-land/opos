import { Trans, useLingui } from '@lingui/react/macro'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useSession } from '../../../shared/lib/session'
import { LoadingView } from '../../../shared/ui'
import { AuthLayout } from '../components/auth-layout'
import { GoogleButton } from '../components/google-button'
import { SignInForm } from '../components/sign-in-form'
import { safeRedirect } from '../model/redirect'

export function LoginPage() {
  const { t } = useLingui()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const status = useSession((state) => state.status)
  const session = useSession((state) => state.session)
  const returnTo = safeRedirect(params.get('redirect'))

  if (status === 'loading') return <LoadingView />
  if (session) return <Navigate to={returnTo} replace />

  return (
    <AuthLayout title={<Trans>Sign in to the organizer panel</Trans>}>
      <SignInForm onSignedIn={() => void navigate(returnTo, { replace: true })} />
      <p className="text-muted text-center text-xs">
        <Trans>or</Trans>
      </p>
      <GoogleButton returnTo={returnTo} />
      <p className="text-muted text-sm">
        {t`Organizers join a convention's team through an invitation sent by email. The link in it lets you create an account here.`}
      </p>
    </AuthLayout>
  )
}
