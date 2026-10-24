import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../../../shared/lib/session'
import { ErrorMessage, LoadingView, PageHeader, Section } from '../../../shared/ui'
import { atLeast, RequireAccess, useCurrentTenant } from '../../tenants'
import { InviteForm } from '../components/invite-form'
import { MemberRow } from '../components/member-row'

/** The convention's team: members, invitations, permissions and expiry (PLAN.md 8). */
export function TeamPage() {
  const { t } = useLingui()
  const { access, api } = useCurrentTenant()
  const accountId = useSession((state) => state.session?.user.id)
  const members = useQuery({
    ...api.tenants.members.list.queryOptions(),
    enabled: atLeast(access.settings, 'read'),
  })

  return (
    <RequireAccess allowed={atLeast(access.settings, 'read')}>
      <PageHeader
        title={<Trans>Team</Trans>}
        description={t`Permissions in each edition are set on the edition's access page.`}
      />
      {atLeast(access.settings, 'write') && (
        <Section title={<Trans>Invite to the team</Trans>}>
          <p className="text-muted text-sm">
            <Trans>
              Someone with a confirmed account joins at once; anyone else gets a link valid for 7
              days. You cannot grant more than you hold yourself.
            </Trans>
          </p>
          <InviteForm />
        </Section>
      )}
      <Section title={<Trans>Members</Trans>}>
        {members.isPending ? (
          <LoadingView />
        ) : members.isError ? (
          <ErrorMessage error={members.error} />
        ) : (
          <ul className="flex flex-col">
            {members.data.map((member) => (
              <MemberRow key={member.id} member={member} isSelf={member.account.id === accountId} />
            ))}
          </ul>
        )}
      </Section>
    </RequireAccess>
  )
}
