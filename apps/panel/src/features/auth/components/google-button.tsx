import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import { AUTH_CALLBACK_PATH, panelUrl } from '../../../shared/config/routes'
import { auth } from '../../../shared/lib/auth'
import { Button, ErrorMessage } from '../../../shared/ui'

/** Google sign-in and sign-up in one: Supabase Auth returns to /auth/callback (PLAN.md 7.5). */
export function GoogleButton({ onBeforeRedirect }: { onBeforeRedirect?: () => void }) {
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  const start = async () => {
    setError(null)
    setPending(true)
    onBeforeRedirect?.()
    const { error } = await auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: panelUrl(AUTH_CALLBACK_PATH) },
    })
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
