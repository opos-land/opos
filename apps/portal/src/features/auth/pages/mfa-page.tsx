import { Trans, useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { errorCode } from '../../../shared/lib/errors'
import { startSession, useSession } from '../../../shared/lib/session'
import {
  Button,
  ErrorMessage,
  Field,
  inputClass,
  linkClass,
  LoadingView,
  UnavailableView,
} from '../../../shared/ui'
import { recoverWithCode, verifyCode } from '../api/auth'
import { AuthCard } from '../components/auth-card'
import { loginPath, safeRedirect } from '../model/redirect'

const SIX_DIGITS = /^\d{6}$/

/**
 * `/auth/mfa` (PLAN.md 7.12): the code of the authenticator app, or a recovery code, for a session
 * that signed in below `aal2`. A right code shows the account and opens the page the sign-in came
 * from; a recovery code turns two-factor authentication off first. A wrong code keeps the form.
 */
export function MfaPage() {
  const { t } = useLingui()
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
    setError(null)
    const code = value.trim()
    const wrong = !recovery && !SIX_DIGITS.test(code)
    setInvalid(wrong)
    if (wrong) return
    setPending(true)
    const failure = await (recovery ? recoverWithCode(code) : verifyCode(code))
    setPending(false)
    if (failure) setError(failure)
  }

  const switchTo = (next: boolean) => {
    setRecovery(next)
    setValue('')
    setInvalid(false)
    setError(null)
  }

  return (
    <AuthCard
      title={<Trans>Two-factor authentication</Trans>}
      lead={
        recovery ? (
          <Trans>
            Enter one of the recovery codes you saved. It turns two-factor authentication off.
          </Trans>
        ) : (
          <Trans>Enter the code from your authenticator app to finish signing in.</Trans>
        )
      }
    >
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
        <Field
          label={recovery ? t`Recovery code` : t`Code`}
          error={invalid && t`Enter the six digits from your authenticator app.`}
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
        <Button type="submit" pending={pending}>
          <Trans>Continue</Trans>
        </Button>
      </form>
      {errorCode(error) === 'session.invalid' && (
        <Link to={loginPath(returnTo)} className={`${linkClass} inline-flex min-h-11 items-center`}>
          <Trans>Go to sign-in</Trans>
        </Link>
      )}
      <Button variant="secondary" onClick={() => switchTo(!recovery)}>
        {recovery ? <Trans>Use the code of the app</Trans> : <Trans>Use a recovery code</Trans>}
      </Button>
    </AuthCard>
  )
}
