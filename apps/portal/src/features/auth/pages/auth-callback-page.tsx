import { Trans } from '@lingui/react/macro'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ErrorMessage, linkClass, LoadingView } from '../../../shared/ui'
import { exchangeCode } from '../api/auth'
import { AuthCard } from '../components/auth-card'
import { authReturn, forgetAuthReturn } from '../model/auth-return'
import { loginPath } from '../model/redirect'
import { linkState } from '../model/returned-error'

/**
 * The return from Supabase Auth with `?code=` — Google or an email confirmation (PLAN.md 7.5, 9):
 * the code becomes a session, then the page the round trip started on opens.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [link] = useState(() => linkState(window.location))
  const [returnTo] = useState(authReturn)
  const [error, setError] = useState<unknown>(link.error)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    // The return is used once, whatever the outcome: a later sign-in sets its own.
    forgetAuthReturn()
    if (!link.code) return
    void exchangeCode(link.code).then((failure) => {
      if (failure) setError(failure)
      else void navigate(returnTo, { replace: true })
    })
  }, [link, navigate, returnTo])

  if (!error) return <LoadingView />

  // A confirmation opened in another browser confirms the address but signs nobody in there.
  return (
    <AuthCard title={<Trans>We could not sign you in</Trans>}>
      <ErrorMessage error={error} />
      <p className="text-sm">
        <Trans>If you opened a confirmation link, your address may be confirmed already.</Trans>
      </p>
      <Link to={loginPath(returnTo)} className={linkClass}>
        <Trans>Go to sign-in</Trans>
      </Link>
    </AuthCard>
  )
}
