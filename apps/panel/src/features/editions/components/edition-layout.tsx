import { Trans } from '@lingui/react/macro'
import {
  CalendarClockIcon,
  ChartColumnIcon,
  FileTextIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  PuzzleIcon,
  ReceiptTextIcon,
  ScanLineIcon,
  Settings2Icon,
  ShirtIcon,
  StoreIcon,
  TicketIcon,
  TicketPercentIcon,
  UsersIcon,
} from 'lucide-react'
import { useParams } from 'react-router'
import { AreaFrame, atLeast, SidebarLink, useCurrentTenant } from '../../tenants'
import { useEditionBySlug } from '../hooks/use-editions'

/**
 * The edition area, where most members work: the menu of everything about one edition,
 * its settings and team access included; the switch to another edition is the area switcher's. Until
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
                <SidebarLink to={`${base}/shop`} icon={<StoreIcon />}>
                  <Trans>Shop</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/orders`} icon={<ReceiptTextIcon />}>
                  <Trans>Orders</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/sales`} icon={<ChartColumnIcon />}>
                  <Trans>Sales</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/scanners`} icon={<ScanLineIcon />}>
                  <Trans>Scanners</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/ticket-types`} icon={<TicketIcon />}>
                  <Trans>Ticket types</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/add-ons`} icon={<PuzzleIcon />}>
                  <Trans>Add-ons</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/merchandise`} icon={<ShirtIcon />}>
                  <Trans>Merchandise</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/discount-codes`} icon={<TicketPercentIcon />}>
                  <Trans>Discount codes</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/ticket-holders`} icon={<UsersIcon />}>
                  <Trans>Ticket holders’ data</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/documents`} icon={<FileTextIcon />}>
                  <Trans>Documents and consents</Trans>
                </SidebarLink>
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
