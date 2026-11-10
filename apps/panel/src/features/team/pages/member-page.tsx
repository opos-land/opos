import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import { useSession } from '../../../shared/lib/session'
import {
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  NotFoundView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { atLeast, useCurrentTenant } from '../../tenants'
import { membersOptions } from '../api/members'
import { BackToTeam } from '../components/back-to-team'
import { MemberForm } from '../components/member-form'
import { RemoveMember } from '../components/remove-member'
import { canManage, memberName } from '../model/member'

/** One member of the team (`/settings/team/:membershipId`): the membership's change and removal. */
export function MemberPage() {
  const { t } = useLingui()
  const { membershipId } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const navigate = useNavigate()
  const accountId = useSession((state) => state.account?.id)
  const allowed = atLeast(access.settings, 'write')
  const members = useQuery({ ...membersOptions(api), enabled: allowed })
  const member = members.data?.find((entry) => entry.id === membershipId)
  usePageTitle(member ? memberName(member) : t`Team`, tenant.name)

  if (!allowed) return <NoPermissionView />
  if (members.isPending) return <LoadingView />
  if (members.isError) return <ErrorMessage error={members.error} />
  if (!member) return <NotFoundView />
  if (!canManage(access, member, member.account.id === accountId)) return <NoPermissionView />

  const name = memberName(member)
  const team = `/${tenant.slug}/settings/team`
  return (
    <>
      <PageHeader
        title={name}
        description={name === member.account.email ? undefined : member.account.email}
        actions={<BackToTeam />}
      />
      <Section title={<Trans>Membership</Trans>}>
        <MemberForm member={member} onSaved={() => void navigate(team)} />
      </Section>
      <Section title={<Trans>Remove from the team</Trans>}>
        {/* Replaced in the history: going back never returns to a member who is gone. */}
        <RemoveMember member={member} onRemoved={() => void navigate(team, { replace: true })} />
      </Section>
    </>
  )
}
