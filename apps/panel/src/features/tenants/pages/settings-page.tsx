import { zodResolver } from '@hookform/resolvers/zod'
import { msg } from '@lingui/core/macro'

import { Trans, useLingui } from '@lingui/react/macro'
import { SUPPORTED_LOCALES } from '@opos/i18n'
import { updateTenantSchema } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { languageName } from '../../../shared/lib/i18n'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  FieldSet,
  FormField,
  Input,
  NativeSelect,
  NativeSelectOption,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { membershipsKey, tenantOptions, updateTenantOptions } from '../api/tenants'
import { RequireAccess } from '../components/require-access'
import { useCurrentTenant } from '../components/tenant-context'
import { atLeast } from '../model/permissions'

const schema = updateTenantSchema.required()

/** Name, convention language and time zone; the slug is shown, never edited. */
export function SettingsPage() {
  const { t, i18n } = useLingui()
  const { tenant, access, api } = useCurrentTenant()
  usePageTitle(t`General`, tenant.name)
  const queryClient = useQueryClient()
  const canWrite = atLeast(access.settings, 'write')
  const timeZones = useMemo(() => {
    const zones = Intl.supportedValuesOf('timeZone')
    return zones.includes(tenant.timezone) ? zones : [tenant.timezone, ...zones]
  }, [tenant.timezone])

  const form = useForm({
    resolver: zodResolver(schema),
    values: {
      name: tenant.name,
      defaultLocale: tenant.defaultLocale as 'pl',
      timezone: tenant.timezone,
    },
  })
  const update = useMutation({
    ...updateTenantOptions(api),
    meta: { success: msg`The settings are saved.` },
    onSuccess: async (updated) => {
      queryClient.setQueryData(tenantOptions(api).queryKey, updated)
      await queryClient.invalidateQueries({ queryKey: membershipsKey() })
    },
  })
  const { errors } = form.formState

  const submit = form.handleSubmit((body) => {
    update.mutate({ body })
  })

  return (
    <RequireAccess allowed={atLeast(access.settings, 'read')}>
      <PageHeader title={<Trans>General</Trans>} description={tenant.name} />
      <Section title={<Trans>Convention</Trans>}>
        <form
          onSubmit={(event) => void submit(event)}
          noValidate
          className="flex max-w-lg flex-col gap-4"
        >
          <FieldSet disabled={!canWrite}>
            <FormField
              label={t`Name`}
              error={errors.name && t`Enter a name of up to 200 characters.`}
            >
              {(control) => <Input {...control} {...form.register('name')} />}
            </FormField>
            <FormField
              label={t`Address`}
              hint={t`The convention's address is set by the platform administrator.`}
            >
              {(control) => <Input {...control} value={tenant.slug} readOnly disabled />}
            </FormField>
            <FormField
              label={t`Convention language`}
              hint={t`The language of the convention's content and of invitations to people without an account.`}
            >
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
              hint={t`Programme times and edition dates are shown in this time zone.`}
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
          </FieldSet>

          <div>
            <Button type="submit" disabled={!canWrite || update.isPending}>
              <Trans>Save</Trans>
            </Button>
          </div>
        </form>
      </Section>
    </RequireAccess>
  )
}
