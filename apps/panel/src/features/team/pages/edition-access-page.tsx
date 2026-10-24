import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { useSession } from '../../../shared/lib/session'
import {
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, RequireAccess, useCurrentTenant } from '../../tenants'
import { EditionAccessRow } from '../components/edition-access-row'
import { memberName } from '../model/member'
import { ProgramLabel, TicketsLabel } from '../components/permission-labels'

/** Team members' permissions in one edition (PLAN.md 8, `/access`). */
export function EditionAccessPage() {
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const accountId = useSession((state) => state.session?.user.id)
  const allowed = atLeast(access.settings, 'read')
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const members = useQuery({ ...api.tenants.members.list.queryOptions(), enabled: allowed })
  const rows = useQuery({
    ...api.editions.members.list.queryOptions({
      input: { params: { editionId: edition?.id ?? '' } },
    }),
    enabled: allowed && Boolean(edition),
  })

  if (!allowed) return <NoPermissionView />
  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition) return <NoPermissionView />

  const editionName = edition.name
  const heads = members.data?.filter((m) => m.role === 'head') ?? []
  const orgs = members.data?.filter((m) => m.role === 'org') ?? []

  return (
    <RequireAccess allowed={allowed}>
      <PageHeader
        title={<Trans>Access to {editionName}</Trans>}
        description={
          <Link to={`/${tenant.slug}/editions/${edition.slug}`} className="text-accent underline">
            <Trans>Back to the edition</Trans>
          </Link>
        }
      />
      <Section title={<Trans>Organizers</Trans>}>
        {members.isPending || rows.isPending ? (
          <LoadingView />
        ) : members.isError || rows.isError ? (
          <ErrorMessage error={members.error ?? rows.error} />
        ) : orgs.length === 0 ? (
          <p className="text-sm">
            <Trans>The team has no organizers besides its head organizers.</Trans>
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  <Trans>Member</Trans>
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  <ProgramLabel />
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  <TicketsLabel />
                </th>
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">
                    <Trans>Actions</Trans>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((member) => (
                <EditionAccessRow
                  key={member.id}
                  edition={edition}
                  member={member}
                  row={rows.data.find((r) => r.tenantMembershipId === member.id)}
                  isSelf={member.account.id === accountId}
                />
              ))}
            </tbody>
          </table>
        )}
      </Section>
      {heads.length > 0 && (
        <Section title={<Trans>Head organizers</Trans>}>
          <p className="text-muted text-sm">
            <Trans>A head organizer already has access to every edition.</Trans>
          </p>
          <ul className="text-sm">
            {heads.map((member) => (
              <li key={member.id}>{memberName(member)}</li>
            ))}
          </ul>
        </Section>
      )}
    </RequireAccess>
  )
}
