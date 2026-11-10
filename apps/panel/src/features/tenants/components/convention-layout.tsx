import { Trans } from '@lingui/react/macro'
import { CalendarRangeIcon, SlidersHorizontalIcon, UsersIcon } from 'lucide-react'
import { AreaFrame, SidebarLink } from './area-frame'
import { useCurrentTenant } from './tenant-context'

/**
 * The convention settings: what belongs to the whole convention, for a member who may
 * open them. A section of one edition never appears here; it lives in the edition's own menu.
 */
export function ConventionLayout() {
  const { tenant, access } = useCurrentTenant()
  const base = `/${tenant.slug}/settings`

  if (!access.seesConventionSettings) return <AreaFrame />

  return (
    <AreaFrame
      menu={{
        label: tenant.name,
        title: <Trans>Convention settings</Trans>,
        links: (
          <>
            <SidebarLink to={base} end icon={<SlidersHorizontalIcon />}>
              <Trans>General</Trans>
            </SidebarLink>
            <SidebarLink to={`${base}/editions`} icon={<CalendarRangeIcon />}>
              <Trans>Editions</Trans>
            </SidebarLink>
            <SidebarLink to={`${base}/team`} icon={<UsersIcon />}>
              <Trans>Team</Trans>
            </SidebarLink>
          </>
        ),
      }}
    />
  )
}
