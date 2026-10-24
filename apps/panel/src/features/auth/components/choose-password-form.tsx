import { zodResolver } from '@hookform/resolvers/zod'
import { Trans, useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button, ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { setPassword, signOutOtherSessions } from '../api/auth'

const schema = z
  .object({ password: z.string().min(8), repeat: z.string() })
  .refine((v) => v.password === v.repeat, { path: ['repeat'] })

/**
 * The password of an account whose address has just been confirmed (PLAN.md 7.7, step 5). It
 * replaces any password set on the address before, and ends every other session, as a password
 * reset does.
 */
export function ChoosePasswordForm({ email, onDone }: { email: string; onDone: () => void }) {
  const { t } = useLingui()
  const [error, setError] = useState<unknown>(null)
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', repeat: '' },
  })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async ({ password }) => {
    setError(null)
    const updateError = await setPassword(password)
    if (updateError) return setError(updateError)
    const signOutError = await signOutOtherSessions()
    if (signOutError) return setError(signOutError)
    onDone()
  })

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-3">
      <p className="text-sm">
        <Trans>Your address {email} is confirmed. Choose the password you will sign in with.</Trans>
      </p>
      <Field
        label={t`New password`}
        hint={t`At least 8 characters.`}
        error={errors.password && t`Use at least 8 characters.`}
      >
        {(control) => (
          <input
            {...control}
            {...form.register('password')}
            type="password"
            autoComplete="new-password"
            className={inputClass}
          />
        )}
      </Field>
      <Field label={t`Repeat the password`} error={errors.repeat && t`The passwords differ.`}>
        {(control) => (
          <input
            {...control}
            {...form.register('repeat')}
            type="password"
            autoComplete="new-password"
            className={inputClass}
          />
        )}
      </Field>
      <ErrorMessage error={error} />
      <Button type="submit" pending={isSubmitting}>
        <Trans>Save the password and join the team</Trans>
      </Button>
    </form>
  )
}
