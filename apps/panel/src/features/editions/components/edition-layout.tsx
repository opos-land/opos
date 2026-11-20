import { Trans } from '@lingui/react/macro'
import {
  CalendarClockIcon,
  ChartColumnIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  ReceiptTextIcon,
  ScanLineIcon,
  Settings2Icon,
  StoreIcon,
  TicketIcon,
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
 * What a member opens day by day stands in the menu itself: the programme, the orders, the sales
 * and the scanners. What the shop is set up with once is folded into two folders: the offer, which
 * is what the edition sells, and the shop setup, which is when the shop is open and what it asks
 * of a buyer.
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
              <>
                <SidebarLink to={`${base}/orders`} icon={<ReceiptTextIcon />}>
                  <Trans>Orders</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/sales`} icon={<ChartColumnIcon />}>
                  <Trans>Sales</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/scanners`} icon={<ScanLineIcon />}>
                  <Trans>Scanners</Trans>
                </SidebarLink>
                <SidebarFolder
                  icon={<TicketIcon />}
                  title={<Trans>Offer</Trans>}
                  links={[
                    { to: `${base}/ticket-types`, label: <Trans>Ticket types</Trans> },
                    { to: `${base}/add-ons`, label: <Trans>Add-ons</Trans> },
                    { to: `${base}/merchandise`, label: <Trans>Merchandise</Trans> },
                    { to: `${base}/discount-codes`, label: <Trans>Discount codes</Trans> },
                  ]}
                />
                <SidebarFolder
                  icon={<StoreIcon />}
                  title={<Trans>Shop setup</Trans>}
                  links={[
                    { to: `${base}/shop`, label: <Trans>Shop</Trans> },
                    { to: `${base}/ticket-holders`, label: <Trans>Ticket holders’ data</Trans> },
                    { to: `${base}/documents`, label: <Trans>Documents and consents</Trans> },
                  ]}
                />
              </>
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
