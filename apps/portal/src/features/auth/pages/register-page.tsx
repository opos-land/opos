import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useSession } from '../../../shared/lib/session'
import { linkClass, LoadingView } from '../../../shared/ui'
import { AuthCard } from '../components/auth-card'
import { GoogleButton } from '../components/google-button'
import { RegisterForm } from '../components/register-form'
import { ResendConfirmation } from '../components/resend-confirmation'
import { loginPath, safeRedirect } from '../model/redirect'

export function RegisterPage() {
  const [params] = useSearchParams()
  const status = useSession((state) => state.status)
  const session = useSession((state) => state.session)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const returnTo = safeRedirect(params.get('redirect'))

  if (status === 'loading') return <LoadingView />
  if (session) return <Navigate to={returnTo} replace />

  if (sentTo) {
    return (
      <AuthCard title={<Trans>Check your inbox</Trans>}>
        <p>
          <Trans>
            We sent a confirmation link to {sentTo}. Open it to start using your account. The link
            works for one hour.
          </Trans>
        </p>
        <ResendConfirmation email={sentTo} returnTo={returnTo} />
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={<Trans>Create an account</Trans>}
      lead={<Trans>One account for every convention on OPOS.</Trans>}
    >
      <RegisterForm returnTo={returnTo} onRegistered={setSentTo} />
      <p className="text-muted text-center text-sm">
        <Trans>or</Trans>
      </p>
      <GoogleButton returnTo={returnTo} />
      <p className="text-sm">
        <Trans>
          Already have an account?{' '}
          <Link to={loginPath(returnTo)} className={linkClass}>
            Sign in
          </Link>
        </Trans>
      </p>
    </AuthCard>
  )
}
