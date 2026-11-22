import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type AdminProfileReport } from '@opos/contract'
import { reportReasonNames } from '@opos/i18n/profiles'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { errorCode } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Badge,
  buttonVariants,
  ErrorMessage,
  IrreversibleAction,
  LoadingView,
  NotFoundView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { adminKey, closeProfileReportOptions, profileReportOptions } from '../api/profiles'
import { shownMoment } from '../model/shown'

/**
 * `/profile-reports/:reportId`: what a report says, the way to the profile it reports, and its
 * closing, which leaves the profile as it is. A closed report is not opened again, so closing
 * asks first (docs/specs/0016-public-profile.md, T1, R6 and T13).
 */
export function ProfileReportPage() {
  const { t, i18n } = useLingui()
  const { reportId = '' } = useParams()
  const queryClient = useQueryClient()
  const report = useQuery(profileReportOptions(reportId))
  usePageTitle(t`Profile report`)
  const close = useMutation({
    ...closeProfileReportOptions(),
    meta: {
      success: ({ emailSent }: { report: AdminProfileReport; emailSent: boolean | null }) =>
        emailSent === false
          ? msg`The report is closed, but the email to who sent it could not be sent.`
          : emailSent
            ? msg`The report is closed, and who sent it was told.`
            : msg`The report is closed.`,
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey() }),
  })

  if (report.isPending) return <LoadingView />
  if (report.isError) {
    const code = errorCode(report.error)
    // An identifier that names no report, or is no identifier at all.
    if (code === 'request.not-found' || code === 'request.invalid') return <NotFoundView />
    return (
      <section className="p-8">
        <ErrorMessage error={report.error} />
      </section>
    )
  }
  const { data } = report

  return (
    <main className="py-6">
      <PageHeader
        title={<Trans>Profile report</Trans>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Trans>Sent {shownMoment(data.createdAt)}</Trans>
            {data.closedAt ? (
              <Badge variant="secondary">
                <Trans comment="The state of a report an admin closed">Closed</Trans>
              </Badge>
            ) : (
              <Badge>
                <Trans comment="The state of a report no admin closed yet">Open</Trans>
              </Badge>
            )}
          </span>
        }
        actions={
          <Link to="/profile-reports" className={buttonVariants({ variant: 'outline' })}>
            <ArrowLeftIcon data-icon="inline-start" />
            <Trans>Back to the reports</Trans>
          </Link>
        }
      />
      <Section title={<Trans>What the report says</Trans>}>
        <p className="font-medium">{i18n._(reportReasonNames[data.reason]!)}</p>
        {data.note ? (
          <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-line">
            {data.note}
          </blockquote>
        ) : (
          <p className="text-muted-foreground text-sm">
            <Trans>The report holds no note.</Trans>
          </p>
        )}
        {data.email ? (
          <p className="text-sm">
            <Trans>
              Who sent it gave an address and is told what comes of the report:{' '}
              <code>{data.email}</code>
            </Trans>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            <Trans>Who sent it gave no address, so nobody is told what came of it.</Trans>
          </p>
        )}
        <p>
          <Link to={`/profiles/${data.accountId}`} className={buttonVariants()}>
            <Trans>Open the reported profile</Trans>
          </Link>
        </p>
      </Section>
      {!data.closedAt && (
        <Section title={<Trans>Closing</Trans>}>
          <p className="text-sm">
            <Trans>
              Close a report when the profile may stay. To act on it instead, take the profile down
              on its page: that closes every open report of it.
            </Trans>
          </p>
          <IrreversibleAction
            label={<Trans>Close the report</Trans>}
            title={<Trans>Close this report?</Trans>}
            action={<Trans>Close the report</Trans>}
            disabled={close.isPending}
            onConfirm={() => close.mutateAsync({ params: { reportId: data.id } })}
            className="self-start"
          >
            <Trans>
              The profile stays as it is. Who sent the report is told so, when they gave an address.
              A closed report is not opened again.
            </Trans>
          </IrreversibleAction>
        </Section>
      )}
    </main>
  )
}
