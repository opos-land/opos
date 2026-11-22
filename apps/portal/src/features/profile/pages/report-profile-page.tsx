import { zodResolver } from '@hookform/resolvers/zod'
import { Trans, useLingui } from '@lingui/react/macro'
import { PROFILE_REPORT_REASONS } from '@opos/contract'
import { publicName } from '@opos/i18n/names'
import { reportReasonNames } from '@opos/i18n/profiles'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router'
import { profilePath } from '../../../shared/config/routes'
import { isNotFound } from '../../../shared/lib/errors'
import { useNoIndex } from '../../../shared/lib/no-index'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  FormField,
  Input,
  linkClass,
  LoadingView,
  NativeSelect,
  NativeSelectOption,
  NotFoundView,
  Page,
  Textarea,
} from '../../../shared/ui'
import { publicProfileOptions, reportProfileOptions } from '../api/profile'
import { emptyReport, reportBody, reportFormSchema } from '../model/report-form'

/**
 * `/profiles/<profile>/report`: anyone reports a published profile, with no sign-in
 * (docs/specs/0016-public-profile.md, R1-R8): one reason, and a note and an email address when the
 * sender chooses to give them. The page says what the address is for before it takes one, and what
 * came of the report once it is sent.
 */
export function ReportProfilePage() {
  const { t, i18n } = useLingui()
  const { profileId = '' } = useParams()
  const profile = useQuery(publicProfileOptions(profileId))
  const name = profile.data ? publicName(i18n, profile.data) : undefined
  usePageTitle(name ? t`Report the profile of ${name}` : undefined)
  useNoIndex()
  const form = useForm({ resolver: zodResolver(reportFormSchema), defaultValues: emptyReport })
  // The page itself says that the report arrived, and a refusal as the form's own message.
  const send = useMutation({ ...reportProfileOptions(), meta: { success: false, failure: false } })
  const { errors } = form.formState

  if (profile.isError) {
    return isNotFound(profile.error) ? <NotFoundView /> : <ErrorMessage error={profile.error} />
  }
  if (profile.isPending || !name) return <LoadingView />

  const back = (
    <p>
      <Link to={profilePath(profileId)} className={linkClass}>
        <Trans>Back to the profile</Trans>
      </Link>
    </p>
  )
  const title = <Trans>Report the profile of {name}</Trans>

  if (send.isSuccess) {
    return (
      <Page title={title}>
        <p>
          <Trans>
            Your report has reached the administrators. They will look at the profile and decide
            whether it stays.
          </Trans>
        </p>
        {back}
      </Page>
    )
  }

  const submit = form.handleSubmit((values) =>
    send.mutate({ params: { profileId }, body: reportBody(values), headers: {} }),
  )

  return (
    <Page
      title={title}
      lead={
        <Trans>
          Tell the administrators of OPOS that this profile should not be here. They read every
          report.
        </Trans>
      }
    >
      {back}
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
        <FormField label={t`Why are you reporting it?`}>
          {(control) => (
            <NativeSelect {...control} {...form.register('reason')}>
              {PROFILE_REPORT_REASONS.map((reason) => (
                <NativeSelectOption key={reason} value={reason}>
                  {i18n._(reportReasonNames[reason]!)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField
          label={t`What should we know? (optional)`}
          error={errors.note && t`Enter up to ${1000} characters.`}
        >
          {(control) => <Textarea {...control} {...form.register('note')} rows={4} />}
        </FormField>
        <FormField
          label={t`Your email address (optional)`}
          hint={t`If you give an address, we write to it twice: that your report arrived, and what was decided. Only the administrators see it, and it is removed with the report. We keep nothing else about you.`}
          error={errors.email && t`Enter an email address, or leave the field empty.`}
        >
          {(control) => (
            <Input {...control} {...form.register('email')} type="email" autoComplete="email" />
          )}
        </FormField>
        <ErrorMessage error={send.error} />
        <Button disabled={send.isPending} type="submit" className="self-start">
          <Trans>Send the report</Trans>
        </Button>
      </form>
    </Page>
  )
}
