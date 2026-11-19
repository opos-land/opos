import { Trans } from '@lingui/react/macro'
import { CalendarRangeIcon, PaletteIcon, SlidersHorizontalIcon, UsersIcon } from 'lucide-react'
import { atLeast } from '../model/permissions'
import { AreaFrame, SidebarLink } from './area-frame'
import { useCurrentTenant } from './tenant-context'

/**
 * The convention settings: what belongs to the whole convention, for a member who may
 * open them, each section by its own permission. A section of one edition never appears here; it
 * lives in the edition's own menu.
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
            {atLeast(access.settings, 'read') && (
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
            )}
            {atLeast(access.branding, 'read') && (
              <SidebarLink to={`${base}/branding`} icon={<PaletteIcon />}>
                <Trans>Branding</Trans>
              </SidebarLink>
            )}
          </>
        ),
      }}
    />
  )
}
