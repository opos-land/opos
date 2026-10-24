import { Trans } from '@lingui/react/macro'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { SIGNED_IN_HOME } from '../../../shared/config/routes'
import { ErrorMessage, linkClass, LoadingView, Notice } from '../../../shared/ui'
import { exchangeCode } from '../api/auth'
import { AuthCard } from '../components/auth-card'
import { NewPasswordForm } from '../components/new-password-form'
import { linkState } from '../model/returned-error'

/**
 * Opened from the recovery link (`?code=`, PLAN.md 7.6): the code becomes a session, the user sets
 * a new password and every other session of the account ends.
 */
export function ResetPasswordPage() {
  const [link] = useState(() => linkState(window.location))
  const [state, setState] = useState<'exchanging' | 'ready' | 'done'>('exchanging')
  const [error, setError] = useState<unknown>(link.error)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!link.code) return
    void exchangeCode(link.code).then((failure) => {
      if (failure) setError(failure)
      else setState('ready')
    })
  }, [link])

  if (error) {
    return (
      <AuthCard title={<Trans>Reset your password</Trans>}>
        <ErrorMessage error={error} />
        <Link to="/forgot-password" className={linkClass}>
          <Trans>Ask for a new link</Trans>
        </Link>
      </AuthCard>
    )
  }

  if (state === 'exchanging') return <LoadingView />

  return (
    <AuthCard title={<Trans>Set a new password</Trans>}>
      {state === 'done' ? (
        <>
          <Notice>
            <Trans>Your new password is saved. You are signed out on every other device.</Trans>
          </Notice>
          <Link to={SIGNED_IN_HOME} className={linkClass}>
            <Trans>Go to your account</Trans>
          </Link>
        </>
      ) : (
        <NewPasswordForm onDone={() => setState('done')} />
      )}
    </AuthCard>
  )
}
