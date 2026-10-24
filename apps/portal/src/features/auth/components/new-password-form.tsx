import { zodResolver } from '@hookform/resolvers/zod'
import { Trans, useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button, ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { setPassword, signOutOtherSessions } from '../api/auth'
import { passwordSchema } from '../model/registration'

/**
 * The new password of a recovery link (PLAN.md 7.6): `updateUser`, then every other session of
 * the account ends.
 */
export function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const { t } = useLingui()
  const [error, setError] = useState<unknown>(null)
  // Set once updateUser has taken it: a retry after a failed signOut does not set it again, which
  // Supabase Auth would refuse as `same_password`.
  const [savedPassword, setSavedPassword] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', repeat: '' },
  })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async ({ password }) => {
    setError(null)
    if (savedPassword !== password) {
      const updateError = await setPassword(password)
      if (updateError) return setError(updateError)
      setSavedPassword(password)
    }
    const signOutError = await signOutOtherSessions()
    if (signOutError) return setError(signOutError)
    onDone()
  })

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
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
        <Trans>Save the new password</Trans>
      </Button>
    </form>
  )
}
