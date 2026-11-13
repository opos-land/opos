import { zodResolver } from '@hookform/resolvers/zod'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type AdminTenantDetails, createTenantSchema } from '@opos/contract'
import { SUPPORTED_LOCALES } from '@opos/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { languageName } from '../../../shared/lib/i18n'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  buttonVariants,
  FormField,
  Input,
  NativeSelect,
  NativeSelectOption,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { adminKey, createConventionOptions } from '../api/conventions'

/**
 * `/conventions/new`: a convention with its first head organizer, an account whose email address
 * is confirmed. A refusal of the API, a taken address or an unknown account, is a notification;
 * beside the fields stays only their own validation.
 */
export function NewConventionPage() {
  const { t, i18n } = useLingui()
  usePageTitle(t`New convention`)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const timeZones = useMemo(() => Intl.supportedValuesOf('timeZone'), [])
  const form = useForm({
    resolver: zodResolver(createTenantSchema),
    defaultValues: {
      name: '',
      slug: '',
      defaultLocale: 'pl' as const,
      timezone: 'Europe/Warsaw',
      headEmail: '',
    },
  })
  const create = useMutation({
    ...createConventionOptions(),
    meta: {
      success: (convention: AdminTenantDetails) => {
        const name = convention.name
        return msg`The convention ${name} is created.`
      },
    },
    onSuccess: async (convention) => {
      await queryClient.invalidateQueries({ queryKey: adminKey() })
      void navigate(`/conventions/${convention.id}`)
    },
  })
  const { errors } = form.formState

  const submit = form.handleSubmit((body) => {
    create.mutate({ body })
  })

  return (
    <main className="py-6">
      <PageHeader
        title={<Trans>New convention</Trans>}
        description={t`A convention starts with its first head organizer, who builds its team.`}
        actions={
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            <ArrowLeftIcon data-icon="inline-start" />
            <Trans>Back to the conventions</Trans>
          </Link>
        }
      />
      <Section title={<Trans>Convention data</Trans>}>
        <form
          onSubmit={(event) => void submit(event)}
          noValidate
          className="flex max-w-lg flex-col gap-4"
        >
          <FormField
            label={t`Name`}
            error={errors.name && t`Enter a name of up to 200 characters.`}
          >
            {(control) => <Input {...control} {...form.register('name')} />}
          </FormField>
          <FormField
            label={t`Address`}
            hint={t`The convention's page opens at this address. Changing it later breaks every old link.`}
            error={errors.slug && t`Use 3 to 40 lowercase letters, digits and hyphens.`}
          >
            {(control) => (
              <Input
                {...control}
                {...form.register('slug')}
                autoCapitalize="none"
                spellCheck={false}
              />
            )}
          </FormField>
          <FormField label={t`Convention language`}>
            {(control) => (
              <NativeSelect {...control} {...form.register('defaultLocale')}>
                {SUPPORTED_LOCALES.map((locale) => (
                  <NativeSelectOption key={locale} value={locale}>
                    {languageName(locale, i18n.locale)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            label={t`Time zone`}
            error={errors.timezone && t`Choose a time zone from the list.`}
          >
            {(control) => (
              <NativeSelect {...control} {...form.register('timezone')}>
                {timeZones.map((zone) => (
                  <NativeSelectOption key={zone} value={zone}>
                    {zone}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            label={t`Email address of the first head organizer`}
            hint={t`An account with a confirmed email address. Nothing is sent to it.`}
            error={errors.headEmail && t`Enter a valid email address.`}
          >
            {(control) => (
              <Input {...control} {...form.register('headEmail')} type="email" autoComplete="off" />
            )}
          </FormField>
          <Button type="submit" disabled={create.isPending} className="self-start">
            <Trans>Create the convention</Trans>
          </Button>
        </form>
      </Section>
    </main>
  )
}
