import { Trans } from '@lingui/react/macro'
import { atLeast } from '../model/permissions'
import { AreaFrame, SidebarLink } from './area-frame'
import { useCurrentTenant } from './tenant-context'

/**
 * The convention area (PLAN.md 8): the menu of what belongs to the whole convention. A section of
 * one edition never appears here; it lives in the edition's own menu.
 */
export function ConventionLayout() {
  const { tenant, access } = useCurrentTenant()
  const base = `/${tenant.slug}`

  return (
    <AreaFrame
      menu={{
        label: tenant.name,
        header: (
          <p className="text-muted text-xs font-semibold tracking-wide uppercase">{tenant.name}</p>
        ),
        links: (
          <>
            <SidebarLink to={base} end>
              <Trans>Dashboard</Trans>
            </SidebarLink>
            <SidebarLink to={`${base}/editions`} end>
              <Trans>Editions</Trans>
            </SidebarLink>
            {atLeast(access.settings, 'read') && (
              <>
                <SidebarLink to={`${base}/team`}>
                  <Trans>Team</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/settings`}>
                  <Trans>Settings</Trans>
                </SidebarLink>
              </>
            )}
          </>
        ),
      }}
    />
  )
}
