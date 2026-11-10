import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { UserPlusIcon } from 'lucide-react'
import { Link } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import { useSession } from '../../../shared/lib/session'
import { buttonVariants, ErrorMessage, LoadingView, PageHeader, Section } from '../../../shared/ui'
import { atLeast, RequireAccess, useCurrentTenant } from '../../tenants'
import { membersOptions } from '../api/members'
import { MembersTable } from '../components/members-table'

/** The convention's team; a member with `settings=write` invites and opens the members to change. */
export function TeamPage() {
  const { t } = useLingui()
  const { tenant, access, api } = useCurrentTenant()
  usePageTitle(t`Team`, tenant.name)
  const accountId = useSession((state) => state.account?.id)
  const members = useQuery({
    ...membersOptions(api),
    enabled: atLeast(access.settings, 'read'),
  })

  return (
    <RequireAccess allowed={atLeast(access.settings, 'read')}>
      <PageHeader
        title={<Trans>Team</Trans>}
        description={t`Permissions in each edition are set on the edition's access page.`}
        actions={
          atLeast(access.settings, 'write') && (
            <Link to={`/${tenant.slug}/settings/team/invite`} className={buttonVariants()}>
              <UserPlusIcon data-icon="inline-start" />
              <Trans>Invite to the team</Trans>
            </Link>
          )
        }
      />
      <Section title={<Trans>Members</Trans>}>
        {members.isPending ? (
          <LoadingView />
        ) : members.isError ? (
          <ErrorMessage error={members.error} />
        ) : (
          <MembersTable members={members.data} accountId={accountId} />
        )}
      </Section>
    </RequireAccess>
  )
}
