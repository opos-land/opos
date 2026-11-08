import { zodResolver } from '@hookform/resolvers/zod'
import { Trans, useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { errorCode } from '../../../shared/lib/errors'
import { Button, ErrorMessage, FormField, Input } from '../../../shared/ui'
import { signInWithPassword } from '../api/auth'
import { ResendConfirmation } from './resend-confirmation'

const schema = z.object({ email: z.email(), password: z.string().min(1) })

/**
 * Email and password. An address not confirmed yet is refused with `auth.email_not_confirmed`, and
 * the form then offers to send its link again (`POST /auth/resend`).
 */
export function SignInForm({ returnTo, onSignedIn }: { returnTo: string; onSignedIn: () => void }) {
  const { t } = useLingui()
  const [failure, setFailure] = useState<{ error: unknown; email: string } | null>(null)
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async (values) => {
    setFailure(null)
    const error = await signInWithPassword(values)
    // An account with two-factor authentication goes on to the code screen, which is no error.
    if (errorCode(error) === 'session.mfa-required') return
    if (error) setFailure({ error, email: values.email })
    else onSignedIn()
  })

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <FormField label={t`Email`} error={errors.email && t`Enter a valid email address.`}>
        {(control) => (
          <Input
            {...control}
            {...form.register('email')}
            type="email"
            autoComplete="email"
            inputMode="email"
          />
        )}
      </FormField>
      <FormField label={t`Password`} error={errors.password && t`Enter your password.`}>
        {(control) => (
          <Input
            {...control}
            {...form.register('password')}
            type="password"
            autoComplete="current-password"
          />
        )}
      </FormField>
      <ErrorMessage error={failure?.error} />
      {failure && errorCode(failure.error) === 'auth.email_not_confirmed' && (
        <ResendConfirmation email={failure.email} returnTo={returnTo} />
      )}
      <Button disabled={isSubmitting} type="submit">
        <Trans>Sign in</Trans>
      </Button>
    </form>
  )
}
