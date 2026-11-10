import { zodResolver } from '@hookform/resolvers/zod'
import { useLingui } from '@lingui/react/macro'
import { type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Button, FieldSet, FormField, Input, Textarea } from '../../../shared/ui'
import { useTenantTime } from '../../tenants'
import {
  endsAtProblem,
  type ProgramItemBody,
  programItemBody,
  programItemFormSchema,
  type ProgramItemFormValues,
} from '../model/program-item-form'

export function ProgramItemForm({
  defaultValues,
  disabled = false,
  pending,
  submitLabel,
  onSubmit,
}: {
  defaultValues: ProgramItemFormValues
  disabled?: boolean
  pending: boolean
  submitLabel: ReactNode
  onSubmit: (body: ProgramItemBody) => void
}) {
  const { t } = useLingui()
  const time = useTenantTime()
  const form = useForm({ resolver: zodResolver(programItemFormSchema), values: defaultValues })
  const { errors } = form.formState
  const zone = time.timeZone

  const submit = form.handleSubmit((values) => {
    const body = programItemBody(values, time.fromInput)
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
        <FormField
          label={t`Title`}
          error={errors.title && t`Enter a title of 3 to 200 characters.`}
        >
          {(control) => <Input {...control} {...form.register('title')} />}
        </FormField>
        <FormField
          label={t`Description`}
          error={errors.description && t`Use up to 5000 characters.`}
        >
          {(control) => <Textarea {...control} {...form.register('description')} rows={4} />}
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
              ? t`The programme item must end after it starts.`
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
