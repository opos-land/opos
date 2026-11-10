import { Trans, useLingui } from '@lingui/react/macro'
import { type FormEvent, useState } from 'react'
import { errorCode } from '../../../shared/lib/errors'
import { Button, ErrorMessage, FormField, Input } from '../../../shared/ui'
import { GoogleButton, signInWithPassword } from '../../auth'
import { type SignInMethods } from '../model/sign-in-methods'

/**
 * A sign-in from the last 5 minutes, asked for again as the account's
 * `signInMethods` allow: the password here, Google by leaving and coming back to `returnTo`. On an
 * account with two-factor authentication the password sign-in leads through the code screen first.
 */
export function ReauthenticateForm({
  email,
  methods,
  returnTo,
  error,
  onConfirmed,
  onCancel,
}: {
  email: string
  methods: SignInMethods
  returnTo: string
  /** What the refused call said, shown above the form. */
  error: unknown
  onConfirmed: () => void
  /** Back to where the person was, without confirming. */
  onCancel: () => void
}) {
  const { t } = useLingui()
  const [password, setPassword] = useState('')
  const [failure, setFailure] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    setFailure(null)
    setPending(true)
    const result = await signInWithPassword({ email, password })
    setPending(false)
    // The code screen follows an account with two-factor authentication, and shows no error.
    if (errorCode(result) === 'session.mfa-required') return
    if (result) setFailure(result)
    else onConfirmed()
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorMessage error={failure ?? error} />
      {methods.password && (
        <form onSubmit={(event) => void confirm(event)} className="flex flex-col gap-4">
          <FormField label={t`Your password`} hint={t`Enter it again to confirm it is you.`}>
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </FormField>
          <Button disabled={pending} type="submit" className="self-start">
            <Trans>Confirm</Trans>
          </Button>
        </form>
      )}
      {methods.google && (
        <GoogleButton returnTo={returnTo}>
          <Trans>Confirm with Google</Trans>
        </GoogleButton>
      )}
      <Button variant="outline" className="self-start" disabled={pending} onClick={onCancel}>
        <Trans>Cancel</Trans>
      </Button>
    </div>
  )
}
