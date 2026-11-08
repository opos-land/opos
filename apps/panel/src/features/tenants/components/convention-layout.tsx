import { Trans } from '@lingui/react/macro'
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
        header: (
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            <Trans>Convention settings</Trans>
          </p>
        ),
        links: (
          <>
            <SidebarLink to={base} end>
              <Trans>General</Trans>
            </SidebarLink>
            <SidebarLink to={`${base}/editions`}>
              <Trans>Editions</Trans>
            </SidebarLink>
            <SidebarLink to={`${base}/team`}>
              <Trans>Team</Trans>
            </SidebarLink>
          </>
        ),
      }}
    />
  )
}
