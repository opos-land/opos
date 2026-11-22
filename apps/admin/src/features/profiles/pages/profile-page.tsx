import { Trans, useLingui } from '@lingui/react/macro'
import { publicName } from '@opos/i18n/names'
import { interestNames, reportReasonNames } from '@opos/i18n/profiles'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { env } from '../../../shared/config/env'
import { errorCode } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Badge,
  buttonVariants,
  ErrorMessage,
  LinkRow,
  LoadingView,
  NotFoundView,
  PageHeader,
  RowLink,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { adminProfileOptions } from '../api/profiles'
import { ClearName } from '../components/clear-name'
import { RestoreProfile } from '../components/restore-profile'
import { TakeDownProfile } from '../components/take-down-profile'
import { avatarUrl, shownMoment } from '../model/shown'

/**
 * `/profiles/:accountId`: a profile as it is now, with no history of what it held: the public
 * name, the avatar from its public address, what the profile holds, its state and its reports;
 * and what an admin does about it: takes it down, restores it, clears the account's name. The
 * admin changes nothing a profile says (docs/specs/0016-public-profile.md, T2-T13).
 */
export function ProfilePage() {
  const { t, i18n } = useLingui()
  const { accountId = '' } = useParams()
  const profile = useQuery(adminProfileOptions(accountId))
  const name = profile.data ? publicName(i18n, profile.data) : undefined
  usePageTitle(name ?? t`Profile`)

  if (profile.isPending) return <LoadingView />
  if (profile.isError || !name) {
    const code = errorCode(profile.error)
    // An identifier that names no account, or is no identifier at all.
    if (code === 'request.not-found' || code === 'request.invalid') return <NotFoundView />
    return (
      <section className="p-8">
        <ErrorMessage error={profile.error} />
      </section>
    )
  }
  const { data } = profile
  const { takedown } = data
  const named = data.firstName !== null || data.nickname !== null || data.lastName !== null
  const holdsNothing =
    !data.description &&
    !data.pronouns &&
    !data.city &&
    data.links.length === 0 &&
    data.interests.length === 0

  return (
    <main className="py-6">
      <PageHeader
        title={name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <code>{data.email}</code>
            {takedown ? (
              <Badge variant="destructive">
                <Trans comment="The state of a profile an admin took down">Taken down</Trans>
              </Badge>
            ) : data.published ? (
              <Badge>
                <Trans comment="The state of a profile its account published">Published</Trans>
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Trans comment="The state of a profile its account did not publish">Private</Trans>
              </Badge>
            )}
            {takedown?.reviewRequested && (
              <Badge>
                <Trans>Review requested</Trans>
              </Badge>
            )}
          </span>
        }
        actions={
          <Link to="/profiles" className={buttonVariants({ variant: 'outline' })}>
            <ArrowLeftIcon data-icon="inline-start" />
            <Trans>Back to the profiles</Trans>
          </Link>
        }
      />
      <Section title={<Trans>What the profile shows</Trans>}>
        <p className="text-muted-foreground text-sm">
          <Trans>As it is now. Nothing keeps what it held when it was reported.</Trans>
        </p>
        {data.avatar ? (
          <img
            src={avatarUrl(env.VITE_API_URL, data.avatar, 'large')}
            alt={t`Avatar of ${name}`}
            className="size-32 rounded-full object-cover"
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            <Trans>The account has no avatar.</Trans>
          </p>
        )}
        {data.pronouns && <p className="text-sm">{data.pronouns}</p>}
        {data.city && <p className="text-sm">{data.city}</p>}
        {data.description && <p className="text-sm whitespace-pre-line">{data.description}</p>}
        {data.interests.length > 0 && (
          <ul aria-label={t`Interests`} className="flex flex-wrap gap-2">
            {data.interests.map((interest) => (
              <li key={interest}>
                <Badge variant="secondary">{i18n._(interestNames[interest]!)}</Badge>
              </li>
            ))}
          </ul>
        )}
        {data.links.length > 0 && (
          // Shown as text: the admin copies an address, and opens none from here by a slip.
          <ul aria-label={t`Links`} className="flex flex-col gap-1 text-sm">
            {data.links.map((link) => (
              <li key={link} className="break-all">
                <code>{link}</code>
              </li>
            ))}
          </ul>
        )}
        {holdsNothing && (
          <p className="text-muted-foreground text-sm">
            <Trans>The profile holds nothing.</Trans>
          </p>
        )}
      </Section>

      <Section title={<Trans>Reports</Trans>}>
        {data.reports.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            <Trans>Nobody reported this profile.</Trans>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans>Reason</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Note</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Sent</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Status</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reports.map((report) => (
                <LinkRow key={report.id} to={`/profile-reports/${report.id}`}>
                  <TableCell>
                    <RowLink to={`/profile-reports/${report.id}`}>
                      {i18n._(reportReasonNames[report.reason]!)}
                    </RowLink>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{report.note}</TableCell>
                  <TableCell>{shownMoment(report.createdAt)}</TableCell>
                  <TableCell>
                    {report.closedAt ? (
                      <Trans comment="The state of a report an admin closed">Closed</Trans>
                    ) : (
                      <Trans comment="The state of a report no admin closed yet">Open</Trans>
                    )}
                  </TableCell>
                </LinkRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title={<Trans>Takedown</Trans>}>
        {takedown ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm">
              <Trans>
                Taken down {shownMoment(takedown.at)}: {i18n._(reportReasonNames[takedown.reason]!)}
                . The profile is not public and cannot be published.
              </Trans>
            </p>
            {takedown.note && (
              <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-line">
                {takedown.note}
              </blockquote>
            )}
            <p className="text-sm">
              <Trans>
                Restoring lets the account publish the profile again. Nothing becomes public by the
                restoring alone, and the account gets an email that says so.
              </Trans>
            </p>
            <RestoreProfile profile={data} />
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm">
              <Trans>
                A profile taken down is not public and cannot be published until you restore it. Its
                account keeps changing it and may ask for a review.
              </Trans>
            </p>
            <TakeDownProfile profile={data} name={name} />
          </div>
        )}
      </Section>

      <Section title={<Trans>Name</Trans>}>
        {named ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm">
              <Trans>
                A name stands wherever the account is named to everyone, in the programme too,
                whether or not the profile is public. Clearing it blocks nothing: the account may
                enter a name again.
              </Trans>
            </p>
            <ClearName profile={data} name={name} />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            <Trans>This account has no part of a name.</Trans>
          </p>
        )}
      </Section>
    </main>
  )
}
