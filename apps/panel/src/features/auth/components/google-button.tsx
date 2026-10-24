import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import { Button, ErrorMessage } from '../../../shared/ui'
import { signInWithGoogle } from '../api/auth'

/**
 * Google sign-in and sign-up in one: Supabase Auth returns to /auth/callback, which then opens
 * `returnTo` (PLAN.md 7.5).
 */
export function GoogleButton({
  returnTo,
  onBeforeRedirect,
}: {
  returnTo: string
  onBeforeRedirect?: () => void
}) {
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  const start = async () => {
    setError(null)
    setPending(true)
    onBeforeRedirect?.()
    const error = await signInWithGoogle(returnTo)
    if (error) {
      setError(error)
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" pending={pending} onClick={() => void start()}>
        <Trans>Continue with Google</Trans>
      </Button>
      <ErrorMessage error={error} />
    </div>
  )
}
