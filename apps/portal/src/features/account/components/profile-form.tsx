import { zodResolver } from '@hookform/resolvers/zod'
import { Trans, useLingui } from '@lingui/react/macro'
import { type Account } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Button, ErrorMessage, Field, inputClass, Notice } from '../../../shared/ui'
import { accountKey, updateAccountOptions } from '../api/account'
import { profileSchema, profileUpdate, profileValues } from '../model/profile'

/** The account's first and last name (`PATCH /me`). */
export function ProfileForm({ account }: { account: Account }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const form = useForm({ resolver: zodResolver(profileSchema), values: profileValues(account) })
  const update = useMutation({
    ...updateAccountOptions(),
    onSuccess: (saved) => queryClient.setQueryData(accountKey(), saved),
  })
  const { errors } = form.formState

  const submit = form.handleSubmit((values) => update.mutate({ body: profileUpdate(values) }))

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <Field label={t`First name`} error={errors.firstName && t`Enter up to 100 characters.`}>
        {(control) => (
          <input
            {...control}
            {...form.register('firstName')}
            autoComplete="given-name"
            className={inputClass}
          />
        )}
      </Field>
      <Field label={t`Last name`} error={errors.lastName && t`Enter up to 100 characters.`}>
        {(control) => (
          <input
            {...control}
            {...form.register('lastName')}
            autoComplete="family-name"
            className={inputClass}
          />
        )}
      </Field>
      <ErrorMessage error={update.error} />
      {update.isSuccess && !form.formState.isDirty && (
        <Notice>
          <Trans>Your name is saved.</Trans>
        </Notice>
      )}
      <Button type="submit" pending={update.isPending} className="self-start">
        <Trans>Save</Trans>
      </Button>
    </form>
  )
}
