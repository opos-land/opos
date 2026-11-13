import { Trans, useLingui } from '@lingui/react/macro'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import { useSession } from '../../../shared/lib/session'
import { LoadingView } from '../../../shared/ui'
import { AuthLayout } from '../components/auth-layout'
import { SignInForm } from '../components/sign-in-form'
import { safeRedirect } from '../model/redirect'

/**
 * `/login`: email and password, then the code on its own screen. Nothing else: an admin's
 * account is made, and its password and second factor changed, in the portal.
 */
export function LoginPage() {
  const { t } = useLingui()
  usePageTitle(t`Sign in`)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const status = useSession((state) => state.status)
  const account = useSession((state) => state.account)
  const returnTo = safeRedirect(params.get('redirect'))

  if (status === 'loading') return <LoadingView />
  if (account) return <Navigate to={returnTo} replace />

  return (
    <AuthLayout title={<Trans>Sign in to OPOS administration</Trans>}>
      <SignInForm onSignedIn={() => void navigate(returnTo, { replace: true })} />
      <p className="text-muted-foreground text-sm">
        {t`Only administrators of OPOS sign in here, with a password and the code of two-factor authentication.`}
      </p>
    </AuthLayout>
  )
}
