import { Trans } from '@lingui/react/macro'
import { type ReactNode, useState } from 'react'
import { Button } from '../../../shared/ui'
import { signInWithGoogle } from '../api/auth'

/**
 * Google sign-in and sign-up in one, and a repeated Google sign-in that confirms it is the user: a
 * navigation to the API, which returns to `returnTo` signed in, or to `/login?error=<code>`
 * (PLAN.md 7.5).
 */
export function GoogleButton({
  returnTo,
  children = <Trans>Continue with Google</Trans>,
}: {
  returnTo: string
  children?: ReactNode
}) {
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
      {children}
    </Button>
  )
}
