import { zodResolver } from '@hookform/resolvers/zod'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type MyProfile, PROFILE_INTERESTS } from '@opos/contract'
import { interestNames } from '@opos/i18n/profiles'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import {
  Button,
  CheckboxField,
  FieldLegend,
  FieldSet,
  FormField,
  Input,
  Textarea,
} from '../../../shared/ui'
import { myProfileOptions, updateProfileOptions } from '../api/profile'
import {
  fieldProblem,
  profileFormContent,
  profileFormSchema,
  profileFormValues,
} from '../model/profile-form'

/**
 * What the profile holds (`PUT /me/profile`): a description, pronouns, a city or region, up to
 * three links and the interests of the platform's list, each optional
 * (docs/specs/0016-public-profile.md, P1-P5).
 */
export function ProfileForm({ profile }: { profile: MyProfile }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const form = useForm({
    resolver: zodResolver(profileFormSchema),
    values: profileFormValues(profile),
  })
  const update = useMutation({
    ...updateProfileOptions(),
    meta: { success: msg`Your profile is saved.` },
    onSuccess: (saved) => queryClient.setQueryData(myProfileOptions().queryKey, saved),
  })
  const { errors } = form.formState

  const submit = form.handleSubmit((values) => update.mutate({ body: profileFormContent(values) }))
  const problem = (error: Parameters<typeof fieldProblem>[0], max: number) => {
    const kind = fieldProblem(error)
    if (kind === 'too-long') return t`Enter up to ${max} characters.`
    return kind && t`This field holds a character that cannot be seen. Type it again.`
  }
  const linkProblem = (error: Parameters<typeof fieldProblem>[0]) => {
    const kind = fieldProblem(error)
    if (kind === 'too-long') return t`Enter up to ${200} characters.`
    return kind && t`Enter an address that starts with https://.`
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <FormField
        label={t`About you`}
        hint={t`Plain text of up to 500 characters. Links in it are not clickable.`}
        error={problem(errors.description, 500)}
      >
        {(control) => <Textarea {...control} {...form.register('description')} rows={5} />}
      </FormField>
      <FormField label={t`Pronouns`} error={problem(errors.pronouns, 30)}>
        {(control) => <Input {...control} {...form.register('pronouns')} />}
      </FormField>
      <FormField label={t`City or region`} error={problem(errors.city, 80)}>
        {(control) => (
          <Input {...control} {...form.register('city')} autoComplete="address-level2" />
        )}
      </FormField>
      {profileFormValues(profile).links.map((_, index) => {
        const number = index + 1
        return (
          <FormField
            key={index}
            label={t`Link ${number}`}
            hint={
              index === 0
                ? t`An address that starts with https://. It is shown as it is, and opens in a new tab.`
                : undefined
            }
            error={linkProblem(errors.links?.[index])}
          >
            {(control) => (
              <Input
                {...control}
                {...form.register(`links.${index}`)}
                type="url"
                inputMode="url"
                autoComplete="url"
              />
            )}
          </FormField>
        )
      })}
      <Controller
        control={form.control}
        name="interests"
        render={({ field }) => (
          <FieldSet>
            <FieldLegend>
              <Trans>Interests</Trans>
            </FieldLegend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROFILE_INTERESTS.map((interest) => (
                <CheckboxField
                  key={interest}
                  label={i18n._(interestNames[interest]!)}
                  checked={field.value.includes(interest)}
                  onChange={(checked) =>
                    field.onChange(
                      checked
                        ? [...field.value, interest]
                        : field.value.filter((chosen) => chosen !== interest),
                    )
                  }
                />
              ))}
            </div>
          </FieldSet>
        )}
      />

      <Button disabled={update.isPending} type="submit" className="self-start">
        <Trans>Save the profile</Trans>
      </Button>
    </form>
  )
}
