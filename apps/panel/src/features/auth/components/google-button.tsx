import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import { Button } from '../../../shared/ui'
import { signInWithGoogle } from '../api/auth'

/**
 * Google sign-in and sign-up in one: a navigation to the API, which returns to `returnTo` signed
 * in, or to `/login?error=<code>` (PLAN.md 7.5).
 */
export function GoogleButton({ returnTo }: { returnTo: string }) {
  const [pending, setPending] = useState(false)

  return (
    <Button
      variant="secondary"
      pending={pending}
      onClick={() => {
        setPending(true)
        signInWithGoogle(returnTo)
      }}
    >
      <Trans>Continue with Google</Trans>
    </Button>
  )
}
