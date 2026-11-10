import { Trans, useLingui } from '@lingui/react/macro'
import { usePageTitle } from '../../../shared/lib/page-title'
import { PageHeader, Section } from '../../../shared/ui'
import { atLeast, RequireAccess, useCurrentTenant } from '../../tenants'
import { BackToTeam } from '../components/back-to-team'
import { InviteForm } from '../components/invite-form'

/** An invitation to the team (`/settings/team/invite`), for a member with `settings=write`. */
export function InvitePage() {
  const { t } = useLingui()
  const { tenant, access } = useCurrentTenant()
  usePageTitle(t`Invite to the team`, tenant.name)

  return (
    <RequireAccess allowed={atLeast(access.settings, 'write')}>
      <PageHeader
        title={<Trans>Invite to the team</Trans>}
        description={t`Someone with a confirmed account joins at once; anyone else gets a link valid for 7 days. You cannot grant more than you hold yourself.`}
        actions={<BackToTeam />}
      />
      <Section title={<Trans>Invitation</Trans>}>
        <InviteForm />
      </Section>
    </RequireAccess>
  )
}
