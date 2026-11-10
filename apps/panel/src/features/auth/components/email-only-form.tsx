import { zodResolver } from '@hookform/resolvers/zod'
import { useLingui } from '@lingui/react/macro'
import { type ReactNode, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button, ErrorMessage, FormField, Input } from '../../../shared/ui'

const schema = z.object({ email: z.email() })

/** A form that takes an address and sends something to it: a sign-up or a password link. */
export function EmailOnlyForm({
  defaultEmail,
  submitLabel,
  variant = 'default',
  onSubmit,
}: {
  defaultEmail: string
  submitLabel: ReactNode
  variant?: 'default' | 'outline'
  /** Resolves to the API's error, or null once the message is on its way. */
  onSubmit: (email: string) => Promise<unknown>
}) {
  const { t } = useLingui()
  const [error, setError] = useState<unknown>(null)
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: defaultEmail } })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async ({ email }) => {
    setError(null)
    setError(await onSubmit(email))
  })

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-3">
      <FormField label={t`Email`} error={errors.email && t`Enter a valid email address.`}>
        {(control) => (
          <Input {...control} {...form.register('email')} type="email" autoComplete="email" />
        )}
      </FormField>
      <ErrorMessage error={error} />
      <Button disabled={isSubmitting} type="submit" variant={variant}>
        {submitLabel}
      </Button>
    </form>
  )
}
