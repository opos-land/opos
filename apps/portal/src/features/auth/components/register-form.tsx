import { zodResolver } from '@hookform/resolvers/zod'
import { Trans, useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { PRIVACY_PATH } from '../../../shared/config/routes'
import { Button, ErrorMessage, Field, inputClass, linkClass } from '../../../shared/ui'
import { signUp } from '../api/auth'
import { registrationSchema } from '../model/registration'

/**
 * Registration: the names and the address, no password; it is chosen once the link
 * proves the address. `onRegistered` gets the address the link went to.
 */
export function RegisterForm({
  returnTo,
  onRegistered,
}: {
  returnTo: string
  onRegistered: (email: string) => void
}) {
  const { t } = useLingui()
  const [error, setError] = useState<unknown>(null)
  const form = useForm({
    resolver: zodResolver(registrationSchema),
    defaultValues: { firstName: '', lastName: '', email: '' },
  })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    const failure = await signUp(values, returnTo)
    if (failure) setError(failure)
    else onRegistered(values.email)
  })

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <Field label={t`First name`} error={errors.firstName && t`Enter 1 to 100 characters.`}>
        {(control) => (
          <input
            {...control}
            {...form.register('firstName')}
            autoComplete="given-name"
            className={inputClass}
          />
        )}
      </Field>
      <Field label={t`Last name`} error={errors.lastName && t`Enter 1 to 100 characters.`}>
        {(control) => (
          <input
            {...control}
            {...form.register('lastName')}
            autoComplete="family-name"
            className={inputClass}
          />
        )}
      </Field>
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
      <p className="text-muted text-sm">
        <Trans>
          By creating an account you confirm that you have read the{' '}
          <Link to={PRIVACY_PATH} className={linkClass}>
            privacy policy
          </Link>
          .
        </Trans>
      </p>
      <ErrorMessage error={error} />
      <Button type="submit" pending={isSubmitting}>
        <Trans>Create an account</Trans>
      </Button>
    </form>
  )
}
