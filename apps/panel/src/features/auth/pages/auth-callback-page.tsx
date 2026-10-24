import { Trans } from '@lingui/react/macro'
import { AuthError } from '@supabase/auth-js'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ErrorMessage, LoadingView } from '../../../shared/ui'
import { exchangeCode } from '../api/auth'
import { AuthLayout } from '../components/auth-layout'
import { authReturn, forgetAuthReturn, INVITATION_PATH } from '../model/auth-return'
import { loginPath } from '../model/redirect'

/** Supabase Auth reports a failed link in the query or, for some flows, in the fragment. */
function returnedError() {
  const query = new URLSearchParams(window.location.search)
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const code = query.get('error_code') ?? fragment.get('error_code')
  const error = query.get('error') ?? fragment.get('error')
  if (!code && !error) return null
  return new AuthError(error ?? 'auth error', undefined, code ?? undefined)
}

/**
 * The return from Supabase Auth with `?code=` — Google, an email confirmation, a password link
 * (PLAN.md 7.5, 7.7): the code becomes a session, then the page the round trip started on opens.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [code] = useState(() => new URLSearchParams(window.location.search).get('code'))
  const [returnTo] = useState(authReturn)
  const [error, setError] = useState<unknown>(() =>
    code
      ? returnedError()
      : (returnedError() ?? new AuthError('missing code', undefined, 'otp_expired')),
  )
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    // The return is used once, whatever the outcome: a later sign-in sets its own.
    forgetAuthReturn()
    if (!code || error) return
    void exchangeCode(code).then((failure) => {
      if (failure) setError(failure)
      else void navigate(returnTo, { replace: true })
    })
  }, [code, error, navigate, returnTo])

  if (!error) return <LoadingView />

  return (
    <AuthLayout title={<Trans>We could not sign you in</Trans>}>
      <ErrorMessage error={error} />
      {returnTo === INVITATION_PATH ? (
        <Link to={INVITATION_PATH} className="text-accent text-sm underline">
          <Trans>Back to the invitation</Trans>
        </Link>
      ) : (
        <Link to={loginPath(returnTo)} className="text-accent text-sm underline">
          <Trans>Back to sign-in</Trans>
        </Link>
      )}
    </AuthLayout>
  )
}
