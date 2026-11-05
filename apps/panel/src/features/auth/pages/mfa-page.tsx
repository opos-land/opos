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
  Field,
  inputClass,
  LoadingView,
  UnavailableView,
} from '../../../shared/ui'
import { recoverWithCode, signOut, verifyCode } from '../api/auth'
import { AuthLayout } from '../components/auth-layout'
import { loginPath, safeRedirect } from '../model/redirect'

const SIX_DIGITS = /^\d{6}$/

/**
 * `/auth/mfa` (PLAN.md 7.12): the code of the authenticator app, or a recovery code, for a session
 * that signed in below `aal2`. A right code shows the account and opens the page the sign-in came
 * from; a recovery code turns two-factor authentication off first. A wrong code keeps the form.
 */
export function MfaPage() {
  const { t } = useLingui()
  usePageTitle(t`Two-factor authentication`)
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const returnTo = safeRedirect(params.get('redirect'))
  const status = useSession((state) => state.status)
  const account = useSession((state) => state.account)
  const [recovery, setRecovery] = useState(false)
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
    const wrong = recovery ? code === '' : !SIX_DIGITS.test(code)
    setInvalid(wrong)
    if (wrong) return
    setPending(true)
    const failure = await (recovery ? recoverWithCode(code) : verifyCode(code))
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

  const switchTo = (next: boolean) => {
    setRecovery(next)
    setValue('')
    setInvalid(false)
    setError(null)
  }

  return (
    <AuthLayout title={<Trans>Two-factor authentication</Trans>}>
      <p className="text-sm">
        {recovery ? (
          <Trans>
            Enter one of the recovery codes you saved. It turns two-factor authentication off.
          </Trans>
        ) : (
          <Trans>Enter the code from your authenticator app to finish signing in.</Trans>
        )}
      </p>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
        <Field
          label={recovery ? t`Recovery code` : t`Code`}
          error={
            invalid &&
            (recovery
              ? t`Enter one of your recovery codes.`
              : t`Enter the six digits from your authenticator app.`)
          }
        >
          {(control) => (
            <input
              {...control}
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              {...(recovery
                ? { autoComplete: 'off', autoCapitalize: 'none', spellCheck: false }
                : { inputMode: 'numeric', autoComplete: 'one-time-code' })}
              className={inputClass}
            />
          )}
        </Field>
        <ErrorMessage error={error} />
        <Button type="submit" pending={pending} disabled={leaving}>
          <Trans>Continue</Trans>
        </Button>
      </form>
      <Button variant="secondary" onClick={() => switchTo(!recovery)}>
        {recovery ? <Trans>Use the code of the app</Trans> : <Trans>Use a recovery code</Trans>}
      </Button>
      <ErrorMessage error={leaveError} />
      <Button variant="secondary" pending={leaving} disabled={pending} onClick={() => void leave()}>
        <Trans>Sign out</Trans>
      </Button>
    </AuthLayout>
  )
}
