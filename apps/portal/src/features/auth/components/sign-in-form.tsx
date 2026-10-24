import { zodResolver } from '@hookform/resolvers/zod'
import { Trans, useLingui } from '@lingui/react/macro'
import { type AuthError } from '@supabase/auth-js'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button, ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { signInWithPassword } from '../api/auth'
import { ResendConfirmation } from './resend-confirmation'

const schema = z.object({ email: z.email(), password: z.string().min(1) })

/**
 * Email and password. An address not confirmed yet is refused with `email_not_confirmed`, and the
 * form then offers to send its link again.
 */
export function SignInForm({ returnTo, onSignedIn }: { returnTo: string; onSignedIn: () => void }) {
  const { t } = useLingui()
  const [failure, setFailure] = useState<{ error: AuthError; email: string } | null>(null)
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async (values) => {
    setFailure(null)
    const error = await signInWithPassword(values)
    if (error) setFailure({ error, email: values.email })
    else onSignedIn()
  })

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <Field label={t`Email`} error={errors.email && t`Enter a valid email address.`}>
        {(control) => (
          <input
            {...control}
            {...form.register('email')}
            type="email"
            autoComplete="email"
            inputMode="email"
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
      <ErrorMessage error={failure?.error} />
      {failure?.error.code === 'email_not_confirmed' && (
        <ResendConfirmation email={failure.email} returnTo={returnTo} />
      )}
      <Button type="submit" pending={isSubmitting}>
        <Trans>Sign in</Trans>
      </Button>
    </form>
  )
}
