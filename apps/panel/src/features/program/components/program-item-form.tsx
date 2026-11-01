import { zodResolver } from '@hookform/resolvers/zod'
import { useLingui } from '@lingui/react/macro'
import { type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Button, ErrorMessage, Field, inputClass } from '../../../shared/ui'
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
  error,
  submitLabel,
  onSubmit,
}: {
  defaultValues: ProgramItemFormValues
  disabled?: boolean
  pending: boolean
  error: unknown
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
      <fieldset disabled={disabled} className="flex flex-col gap-4">
        <Field label={t`Title`} error={errors.title && t`Enter a title of 3 to 200 characters.`}>
          {(control) => <input {...control} {...form.register('title')} className={inputClass} />}
        </Field>
        <Field label={t`Description`} error={errors.description && t`Use up to 5000 characters.`}>
          {(control) => (
            <textarea
              {...control}
              {...form.register('description')}
              rows={4}
              className={inputClass}
            />
          )}
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
          error={
            endsAtProblem(errors.endsAt?.type) === 'order'
              ? t`The programme item must end after it starts.`
              : errors.endsAt && t`Enter the end date and time.`
          }
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
