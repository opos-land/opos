import { Trans } from '@lingui/react/macro'
import { type ReactNode, useState } from 'react'
import { Button, ErrorMessage } from '../../../shared/ui'
import { signInWithGoogle } from '../api/auth'

/**
 * Google sign-in and sign-up in one, and a repeated Google sign-in that confirms it is the user:
 * Supabase Auth returns to /auth/callback, which then opens `returnTo` (PLAN.md 7.5). `onLeave`
 * runs just before the browser leaves for Google.
 */
export function GoogleButton({
  returnTo,
  onLeave,
  children = <Trans>Continue with Google</Trans>,
}: {
  returnTo: string
  onLeave?: () => void
  children?: ReactNode
}) {
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  const start = async () => {
    setError(null)
    setPending(true)
    onLeave?.()
    const error = await signInWithGoogle(returnTo)
    if (error) {
      setError(error)
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" pending={pending} onClick={() => void start()}>
        {children}
      </Button>
      <ErrorMessage error={error} />
    </div>
  )
}
