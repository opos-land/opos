import { zodResolver } from '@hookform/resolvers/zod'
import { useLingui } from '@lingui/react/macro'
import { type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Button, FieldSet, FormField, Input } from '../../../shared/ui'
import { useTenantTime } from '../../tenants'
import {
  type EditionBody,
  editionBody,
  editionFormSchema,
  type EditionFormValues,
  endsAtProblem,
} from '../model/edition-form'

export function EditionForm({
  defaultValues,
  disabled = false,
  pending,
  submitLabel,
  onSubmit,
}: {
  defaultValues: EditionFormValues
  disabled?: boolean
  pending: boolean
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
    else form.setError(time.fromInput(values.startsAt) ? 'endsAt' : 'startsAt', { type: 'zone' })
  })

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex max-w-lg flex-col gap-4"
    >
      <FieldSet disabled={disabled}>
        <FormField label={t`Name`} error={errors.name && t`Enter a name of up to 200 characters.`}>
          {(control) => <Input {...control} {...form.register('name')} />}
        </FormField>
        <FormField
          label={t`Address`}
          hint={t`Part of the edition's address in the portal: lowercase letters, digits and hyphens.`}
          error={errors.slug && t`Use 1 to 40 lowercase letters, digits and hyphens.`}
        >
          {(control) => <Input {...control} {...form.register('slug')} />}
        </FormField>
        <FormField
          label={t`Starts`}
          hint={t`In the convention's time zone, ${zone}.`}
          error={errors.startsAt && t`Enter the start date and time.`}
        >
          {(control) => <Input {...control} {...form.register('startsAt')} type="datetime-local" />}
        </FormField>
        <FormField
          label={t`Ends`}
          hint={t`In the convention's time zone, ${zone}.`}
          error={
            endsAtProblem(errors.endsAt?.type) === 'order'
              ? t`The edition must end after it starts.`
              : errors.endsAt && t`Enter the end date and time.`
          }
        >
          {(control) => <Input {...control} {...form.register('endsAt')} type="datetime-local" />}
        </FormField>
      </FieldSet>

      <div>
        <Button type="submit" disabled={disabled || pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
