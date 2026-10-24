import { zodResolver } from '@hookform/resolvers/zod'
import { useLingui } from '@lingui/react/macro'
import { type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Button, ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { useTenantTime } from '../../tenants'
import {
  type EditionBody,
  editionBody,
  editionFormSchema,
  type EditionFormValues,
} from '../model/edition-form'

export function EditionForm({
  defaultValues,
  disabled = false,
  pending,
  error,
  submitLabel,
  onSubmit,
}: {
  defaultValues: EditionFormValues
  disabled?: boolean
  pending: boolean
  error: unknown
  submitLabel: ReactNode
  onSubmit: (body: EditionBody) => void
}) {
  const { t } = useLingui()
  const time = useTenantTime()
  const form = useForm({ resolver: zodResolver(editionFormSchema), values: defaultValues })
  const { errors } = form.formState
  const zone = time.timeZone

  const submit = form.handleSubmit((values) => {
    const body = editionBody(values, time.fromInput)
    if (body) onSubmit(body)
    else form.setError('startsAt', { type: 'zone' })
  })

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex max-w-lg flex-col gap-4"
    >
      <fieldset disabled={disabled} className="flex flex-col gap-4">
        <Field label={t`Name`} error={errors.name && t`Enter a name of up to 200 characters.`}>
          {(control) => <input {...control} {...form.register('name')} className={inputClass} />}
        </Field>
        <Field
          label={t`Address`}
          hint={t`Part of the edition's address in the portal: lowercase letters, digits and hyphens.`}
          error={errors.slug && t`Use 1 to 40 lowercase letters, digits and hyphens.`}
        >
          {(control) => <input {...control} {...form.register('slug')} className={inputClass} />}
        </Field>
        <Field
          label={t`Starts`}
          hint={t`In the convention's time zone, ${zone}.`}
          error={errors.startsAt && t`Enter the start date and time.`}
        >
          {(control) => (
            <input
              {...control}
              {...form.register('startsAt')}
              type="datetime-local"
              className={inputClass}
            />
          )}
        </Field>
        <Field
          label={t`Ends`}
          hint={t`In the convention's time zone, ${zone}.`}
          error={errors.endsAt && t`The edition must end after it starts.`}
        >
          {(control) => (
            <input
              {...control}
              {...form.register('endsAt')}
              type="datetime-local"
              className={inputClass}
            />
          )}
        </Field>
      </fieldset>
      <ErrorMessage error={error} />
      <div>
        <Button type="submit" disabled={disabled} pending={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
