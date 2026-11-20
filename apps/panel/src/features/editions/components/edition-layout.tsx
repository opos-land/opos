import { Trans } from '@lingui/react/macro'
import {
  CalendarClockIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  Settings2Icon,
  StoreIcon,
} from 'lucide-react'
import { useParams } from 'react-router'
import { AreaFrame, atLeast, SidebarFolder, SidebarLink, useCurrentTenant } from '../../tenants'
import { useEditionBySlug } from '../hooks/use-editions'

/**
 * The edition area, where most members work: the menu of everything about one edition,
 * its settings and team access included; the switch to another edition is the area switcher's. Until
 * the edition is known, or when the member does not see it, there is no menu and the page says
 * why.
 *
 * Everything of the shop stands in one folder: what was sold, what is sold, and what the shop is
 * set up with, its own page last under the name of its settings.
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
        title: edition.name,
        links: (
          <>
            <SidebarLink to={base} end icon={<LayoutDashboardIcon />}>
              <Trans>Dashboard</Trans>
            </SidebarLink>
            {atLeast(level.program, 'read') && (
              <SidebarLink to={`${base}/program`} icon={<CalendarClockIcon />}>
                <Trans>Programme</Trans>
              </SidebarLink>
            )}
            {atLeast(level.tickets, 'read') && (
              <SidebarFolder
                icon={<StoreIcon />}
                title={<Trans>Shop</Trans>}
                links={[
                  { to: `${base}/orders`, label: <Trans>Orders</Trans> },
                  { to: `${base}/sales`, label: <Trans>Sales</Trans> },
                  { to: `${base}/scanners`, label: <Trans>Scanners</Trans> },
                  { to: `${base}/ticket-types`, label: <Trans>Ticket types</Trans> },
                  { to: `${base}/add-ons`, label: <Trans>Add-ons</Trans> },
                  { to: `${base}/merchandise`, label: <Trans>Merchandise</Trans> },
                  { to: `${base}/discount-codes`, label: <Trans>Discount codes</Trans> },
                  { to: `${base}/ticket-holders`, label: <Trans>Ticket holders’ data</Trans> },
                  { to: `${base}/documents`, label: <Trans>Documents and consents</Trans> },
                  { to: `${base}/shop`, label: <Trans>Settings</Trans> },
                ]}
              />
            )}
            {atLeast(access.settings, 'read') && (
              <>
                <SidebarLink to={`${base}/access`} icon={<KeyRoundIcon />}>
                  <Trans>Access</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/settings`} icon={<Settings2Icon />}>
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
