import { Trans } from '@lingui/react/macro'
import { useParams } from 'react-router'
import { AreaFrame, atLeast, SidebarLink, useCurrentTenant } from '../../tenants'
import { useEditionBySlug } from '../hooks/use-editions'

/**
 * The edition area, where most members work: the menu of everything about one edition,
 * its settings and team access included; the switch to another edition is in the top bar. Until
 * the edition is known, or when the member does not see it, there is no menu and the page says
 * why.
 */
export function EditionLayout() {
  const { editionSlug } = useParams()
  const { tenant, access } = useCurrentTenant()
  const { edition } = useEditionBySlug(editionSlug)

  if (!edition) return <AreaFrame />

  const base = `/${tenant.slug}/editions/${edition.slug}`
  const level = access.edition(edition.id)

  return (
    <AreaFrame
      menu={{
        label: edition.name,
        header: (
          <p className="text-muted text-xs font-semibold tracking-wide uppercase">{edition.name}</p>
        ),
        links: (
          <>
            <SidebarLink to={base} end>
              <Trans>Dashboard</Trans>
            </SidebarLink>
            {atLeast(level.program, 'read') && (
              <SidebarLink to={`${base}/program`}>
                <Trans>Programme</Trans>
              </SidebarLink>
            )}
            {atLeast(access.settings, 'read') && (
              <>
                <SidebarLink to={`${base}/access`}>
                  <Trans>Access</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/settings`}>
                  <Trans>Edition settings</Trans>
                </SidebarLink>
              </>
            )}
          </>
        ),
      }}
    />
  )
}
