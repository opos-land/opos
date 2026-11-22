import { Trans, useLingui } from '@lingui/react/macro'
import { type profileReportStates } from '@opos/contract'
import { publicName } from '@opos/i18n/names'
import { reportReasonNames } from '@opos/i18n/profiles'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  FormField,
  LinkRow,
  LoadingView,
  NativeSelect,
  NativeSelectOption,
  PageHeader,
  RowLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { profileReportsOptions } from '../api/profiles'
import { shownMoment } from '../model/shown'

type State = (typeof profileReportStates)[number]

/**
 * `/profile-reports`: the reports of profiles, the open ones first shown and the closed ones when
 * asked, the newest on top. A row opens its report (docs/specs/0016-public-profile.md, T1).
 */
export function ProfileReportsPage() {
  const { t, i18n } = useLingui()
  usePageTitle(t`Profile reports`)
  const [state, setState] = useState<State>('open')
  const reports = useQuery(profileReportsOptions(state))

  return (
    <main className="py-6">
      <PageHeader
        title={<Trans>Profile reports</Trans>}
        description={<Trans>What anyone reported of a published profile, the newest first.</Trans>}
      />
      <div className="mb-4 max-w-xs">
        <FormField label={t`Show`}>
          {(control) => (
            <NativeSelect
              {...control}
              value={state}
              onChange={(event) => setState(event.target.value as State)}
            >
              <NativeSelectOption value="open">{t`Open reports`}</NativeSelectOption>
              <NativeSelectOption value="closed">{t`Closed reports`}</NativeSelectOption>
            </NativeSelect>
          )}
        </FormField>
      </div>
      {reports.isPending ? (
        <LoadingView />
      ) : reports.isError ? (
        <ErrorMessage error={reports.error} />
      ) : reports.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {state === 'open' ? (
            <Trans>No report is open.</Trans>
          ) : (
            <Trans>No report is closed.</Trans>
          )}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Trans>Profile of</Trans>
              </TableHead>
              <TableHead>
                <Trans>Reason</Trans>
              </TableHead>
              <TableHead>
                <Trans>Note</Trans>
              </TableHead>
              <TableHead>
                <Trans>Address of the sender</Trans>
              </TableHead>
              <TableHead>
                <Trans>Sent</Trans>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.data.map((report) => (
              <LinkRow key={report.id} to={`/profile-reports/${report.id}`}>
                <TableCell>
                  <RowLink to={`/profile-reports/${report.id}`}>
                    {publicName(i18n, report.account)}
                  </RowLink>
                </TableCell>
                <TableCell>{i18n._(reportReasonNames[report.reason]!)}</TableCell>
                <TableCell className="max-w-xs truncate">{report.note}</TableCell>
                <TableCell>{report.email}</TableCell>
                <TableCell>{shownMoment(report.createdAt)}</TableCell>
              </LinkRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  )
}
