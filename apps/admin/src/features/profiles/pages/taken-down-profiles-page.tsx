import { Trans, useLingui } from '@lingui/react/macro'
import { publicName } from '@opos/i18n/names'
import { reportReasonNames } from '@opos/i18n/profiles'
import { useMutation, useQuery } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Badge,
  Button,
  ErrorMessage,
  FormField,
  Input,
  LinkRow,
  LoadingView,
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
import { findAccountOptions, takenDownProfilesOptions } from '../api/profiles'
import { shownMoment } from '../model/shown'

const emailAddress = z.email()

/**
 * `/profiles`: the profiles taken down, those asking for a review first, and the way to the page
 * of any account by its email address, for an account whose name must go and that has no profile
 * a report could lead to (docs/specs/0016-public-profile.md, T8 and T14).
 */
export function TakenDownProfilesPage() {
  const { t, i18n } = useLingui()
  usePageTitle(t`Profiles`)
  const navigate = useNavigate()
  const profiles = useQuery(takenDownProfilesOptions())
  const [email, setEmail] = useState('')
  const address = email.trim()
  const valid = emailAddress.safeParse(address).success
  // A lookup changes nothing: the page it opens is its result, and a refusal stands in the form.
  const find = useMutation({
    ...findAccountOptions(),
    meta: { success: false, failure: false },
    onSuccess: ({ accountId }) => navigate(`/profiles/${accountId}`),
  })

  const open = (event: FormEvent) => {
    event.preventDefault()
    if (valid) find.mutate({ body: { email: address } })
  }

  return (
    <main className="py-6">
      <PageHeader
        title={<Trans>Profiles</Trans>}
        description={
          <Trans>The profiles taken down, and the way to the profile of any account.</Trans>
        }
      />
      <Section title={<Trans>Find an account</Trans>}>
        <form onSubmit={open} className="flex max-w-lg flex-col items-start gap-4">
          <FormField
            label={t`Email address of the account`}
            hint={t`An organizer sees the address of a speaker in the panel.`}
          >
            {(control) => (
              <Input
                {...control}
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </FormField>
          <ErrorMessage error={find.error} />
          <Button type="submit" disabled={!valid || find.isPending}>
            <Trans>Open the account</Trans>
          </Button>
        </form>
      </Section>
      <Section title={<Trans>Profiles taken down</Trans>}>
        {profiles.isPending ? (
          <LoadingView />
        ) : profiles.isError ? (
          <ErrorMessage error={profiles.error} />
        ) : profiles.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            <Trans>No profile is taken down.</Trans>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans>Name</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Email address</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Reason</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Taken down on</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Review</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.data.map((profile) => (
                <LinkRow key={profile.accountId} to={`/profiles/${profile.accountId}`}>
                  <TableCell>
                    <RowLink to={`/profiles/${profile.accountId}`}>
                      {publicName(i18n, profile)}
                    </RowLink>
                  </TableCell>
                  <TableCell>{profile.email}</TableCell>
                  <TableCell>{i18n._(reportReasonNames[profile.reason]!)}</TableCell>
                  <TableCell>{shownMoment(profile.takenDownAt)}</TableCell>
                  <TableCell>
                    {profile.reviewRequestedAt && (
                      <Badge>
                        <Trans>Review requested</Trans>
                      </Badge>
                    )}
                  </TableCell>
                </LinkRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </main>
  )
}
