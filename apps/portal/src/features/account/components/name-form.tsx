import { zodResolver } from '@hookform/resolvers/zod'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type Account } from '@opos/contract'
import { publicName } from '@opos/i18n/names'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { Button, FormField, Input, NativeSelect, NativeSelectOption } from '../../../shared/ui'
import { mergeSavedAccount, updateAccountOptions } from '../api/account'
import { nameProblem, nameSchema, nameUpdate, nameValues } from '../model/name'

/**
 * The account's name (`PATCH /me`): its first name, nickname and last name, where the nickname
 * stands, and the public name they make, as everyone will read it.
 */
export function NameForm({ account }: { account: Account }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const form = useForm({ resolver: zodResolver(nameSchema), values: nameValues(account) })
  const update = useMutation({
    ...updateAccountOptions(),
    meta: { success: msg`Your name is saved.` },
    onSuccess: (saved) => mergeSavedAccount(queryClient, saved),
  })
  const { errors } = form.formState
  const typed = useWatch({ control: form.control })
  const shown = publicName(i18n, {
    firstName: typed.firstName ?? null,
    nickname: typed.nickname ?? null,
    lastName: typed.lastName ?? null,
    nameOrder: typed.nameOrder ?? account.nameOrder,
  })

  const submit = form.handleSubmit((values) => update.mutate({ body: nameUpdate(values) }))
  const problem = (error: Parameters<typeof nameProblem>[0], max: number) => {
    const kind = nameProblem(error)
    if (kind === 'too-long') return t`Enter up to ${max} characters.`
    return kind && t`This field holds a character that cannot be seen. Type it again.`
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <FormField label={t`First name`} error={problem(errors.firstName, 100)}>
        {(control) => (
          <Input {...control} {...form.register('firstName')} autoComplete="given-name" />
        )}
      </FormField>
      <FormField label={t`Nickname`} error={problem(errors.nickname, 50)}>
        {(control) => <Input {...control} {...form.register('nickname')} autoComplete="nickname" />}
      </FormField>
      <FormField label={t`Last name`} error={problem(errors.lastName, 100)}>
        {(control) => (
          <Input {...control} {...form.register('lastName')} autoComplete="family-name" />
        )}
      </FormField>
      <FormField label={t`Where the nickname stands`}>
        {(control) => (
          <NativeSelect {...control} {...form.register('nameOrder')}>
            <NativeSelectOption value="nickname-middle">
              {t`Between the first and the last name`}
            </NativeSelectOption>
            <NativeSelectOption value="nickname-last">
              {t`After the first and the last name`}
            </NativeSelectOption>
          </NativeSelect>
        )}
      </FormField>
      <p className="text-sm">
        <Trans>
          Everyone sees you as <strong>{shown}</strong>: on your profile and, when you are a
          speaker, in the programme.
        </Trans>
      </p>

      <Button disabled={update.isPending} type="submit" className="self-start">
        <Trans>Save</Trans>
      </Button>
    </form>
  )
}
