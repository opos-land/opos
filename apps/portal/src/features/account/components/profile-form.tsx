import { zodResolver } from '@hookform/resolvers/zod'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type Account } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Button, FormField, Input } from '../../../shared/ui'
import { mergeSavedAccount, updateAccountOptions } from '../api/account'
import { profileSchema, profileUpdate, profileValues } from '../model/profile'

/** The account's first and last name (`PATCH /me`). */
export function ProfileForm({ account }: { account: Account }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const form = useForm({ resolver: zodResolver(profileSchema), values: profileValues(account) })
  const update = useMutation({
    ...updateAccountOptions(),
    meta: { success: msg`Your name is saved.` },
    onSuccess: (saved) => mergeSavedAccount(queryClient, saved),
  })
  const { errors } = form.formState

  const submit = form.handleSubmit((values) => update.mutate({ body: profileUpdate(values) }))

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <FormField label={t`First name`} error={errors.firstName && t`Enter up to 100 characters.`}>
        {(control) => (
          <Input {...control} {...form.register('firstName')} autoComplete="given-name" />
        )}
      </FormField>
      <FormField label={t`Last name`} error={errors.lastName && t`Enter up to 100 characters.`}>
        {(control) => (
          <Input {...control} {...form.register('lastName')} autoComplete="family-name" />
        )}
      </FormField>

      <Button disabled={update.isPending} type="submit" className="self-start">
        <Trans>Save</Trans>
      </Button>
    </form>
  )
}
