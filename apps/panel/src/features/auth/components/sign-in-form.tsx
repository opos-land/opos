import { zodResolver } from '@hookform/resolvers/zod'
import { Trans, useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { errorCode } from '../../../shared/lib/errors'
import { Button, ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { signInWithPassword } from '../api/auth'

const schema = z.object({ email: z.email(), password: z.string().min(1) })

export function SignInForm({
  defaultEmail = '',
  onSignedIn,
  onMfaRequired,
}: {
  defaultEmail?: string
  onSignedIn?: () => void
  /**
   * The account wants its code. The sign-in page is led on by the gate; a page the gate does not
   * hold, the invitation, leads on itself.
   */
  onMfaRequired?: () => void
}) {
  const { t } = useLingui()
  const [error, setError] = useState<unknown>(null)
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: defaultEmail, password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    const error = await signInWithPassword(values)
    // An account with two-factor authentication goes on to the code screen, which is no error.
    if (errorCode(error) === 'session.mfa-required') return onMfaRequired?.()
    if (error) setError(error)
    else onSignedIn?.()
  })

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-3">
      <Field label={t`Email`} error={errors.email && t`Enter a valid email address.`}>
        {(control) => (
          <input
            {...control}
            {...form.register('email')}
            type="email"
            autoComplete="email"
            className={inputClass}
          />
        )}
      </Field>
      <Field label={t`Password`} error={errors.password && t`Enter your password.`}>
        {(control) => (
          <input
            {...control}
            {...form.register('password')}
            type="password"
            autoComplete="current-password"
            className={inputClass}
          />
        )}
      </Field>
      <ErrorMessage error={error} />
      <Button type="submit" pending={isSubmitting}>
        <Trans>Sign in</Trans>
      </Button>
    </form>
  )
}
