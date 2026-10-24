import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import { Button, ErrorMessage, Notice } from '../../../shared/ui'
import { resendConfirmation } from '../api/auth'

/** Sends the confirmation link of an unconfirmed address again (PLAN.md 9, `/login`). */
export function ResendConfirmation({ email, returnTo }: { email: string; returnTo: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'sent'>('idle')
  const [error, setError] = useState<unknown>(null)

  const resend = async () => {
    setError(null)
    setState('pending')
    const failure = await resendConfirmation(email, returnTo)
    setError(failure)
    setState(failure ? 'idle' : 'sent')
  }

  return (
    <div className="flex flex-col gap-2">
      {state === 'sent' ? (
        <Notice>
          <Trans>We sent a new confirmation link to {email}.</Trans>
        </Notice>
      ) : (
        <Button variant="secondary" pending={state === 'pending'} onClick={() => void resend()}>
          <Trans>Send the confirmation link again</Trans>
        </Button>
      )}
      <ErrorMessage error={error} />
    </div>
  )
}
