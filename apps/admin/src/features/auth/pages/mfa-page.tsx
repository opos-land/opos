import { Trans, useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { errorCode } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import { startSession, useSession } from '../../../shared/lib/session'
import {
  Button,
  ErrorMessage,
  FormField,
  Input,
  LoadingView,
  UnavailableView,
} from '../../../shared/ui'
import { signOut, verifyCode } from '../api/auth'
import { AuthLayout } from '../components/auth-layout'
import { loginPath, safeRedirect } from '../model/redirect'

const SIX_DIGITS = /^\d{6}$/

/**
 * `/auth/mfa`: the code of the authenticator app, for a session that signed in below `aal2`. A
 * right code shows the account and opens the page the sign-in came from; a wrong one keeps the
 * form. No recovery code here: it turns two-factor authentication off, which an admin does in
 * the portal, and the admin role would not survive it.
 */
export function MfaPage() {
  const { t } = useLingui()
  usePageTitle(t`Two-factor authentication`)
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const returnTo = safeRedirect(params.get('redirect'))
  const status = useSession((state) => state.status)
  const account = useSession((state) => state.account)
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<unknown>(null)

  // Nothing cached before the code may show an account to the page that follows.
  useEffect(() => {
    if (status === 'mfa-required') queryClient.removeQueries()
  }, [status, queryClient])

  if (status === 'loading') return <LoadingView />
  if (status === 'unavailable') return <UnavailableView onRetry={() => void startSession()} />
  if (account) return <Navigate to={returnTo} replace />
  if (status !== 'mfa-required') return <Navigate to={loginPath(returnTo)} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    // A code sent after Sign out could set the cookies again.
    if (leaving) return
    setError(null)
    const code = value.trim()
    const wrong = !SIX_DIGITS.test(code)
    setInvalid(wrong)
    if (wrong) return
    setPending(true)
    const failure = await verifyCode(code)
    setPending(false)
    // The code is not wanted any more (the session passed, or the account's 2FA was reset): ask who
    // is signed in rather than show a message nothing on this screen can act on.
    if (errorCode(failure) === 'mfa.not-required') void startSession()
    else if (failure) setError(failure)
  }

  // A pending session is the one thing that cannot be left by navigating: signing out lets the
  // next person in, and leads to sign-in once the session shows no account.
  const leave = async () => {
    setLeaveError(null)
    setLeaving(true)
    const failure = await signOut()
    setLeaving(false)
    if (failure) setLeaveError(failure)
  }

  return (
    <AuthLayout title={<Trans>Two-factor authentication</Trans>}>
      <p className="text-sm">
        <Trans>Enter the code from your authenticator app to finish signing in.</Trans>
      </p>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
        <FormField
          label={t`Code`}
          error={invalid && t`Enter the six digits from your authenticator app.`}
        >
          {(control) => (
            <Input
              {...control}
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          )}
        </FormField>
        <ErrorMessage error={error} />
        <Button type="submit" disabled={leaving || pending}>
          <Trans>Continue</Trans>
        </Button>
      </form>
      <ErrorMessage error={leaveError} />
      <Button variant="outline" disabled={pending || leaving} onClick={() => void leave()}>
        <Trans>Sign out</Trans>
      </Button>
    </AuthLayout>
  )
}
