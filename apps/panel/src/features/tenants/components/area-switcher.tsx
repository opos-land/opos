import { Trans, useLingui } from '@lingui/react/macro'
import { type Membership } from '@opos/contract'
import { useQuery } from '@tanstack/react-query'
import { Building2Icon, CalendarDaysIcon, ChevronsUpDownIcon, Settings2Icon } from 'lucide-react'
import { type ReactNode } from 'react'
import { Link, useMatch } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '../../../shared/ui'
import { editionListOptions } from '../api/tenants'
import { usePermissionStore } from '../model/permissions'
import { useCurrentTenant } from './tenant-context'

/** The switcher at the head of the sidebar: what is open and what it belongs to, then the choices. */
function Switcher({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
}) {
  const { isMobile } = useSidebar()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              {icon}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{title}</span>
              {subtitle && <span className="truncate text-xs">{subtitle}</span>}
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-fit"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            {children}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** A choice of the switcher, opening its page. */
function Choice({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenuItem render={<Link to={to} />} className="gap-2 p-2">
      <div className="flex size-6 items-center justify-center rounded-md border">{icon}</div>
      {children}
    </DropdownMenuItem>
  )
}

/** The conventions to switch to, each opening on the member's edition. */
function Conventions({ memberships }: { memberships: Membership[] }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        <Trans>Conventions</Trans>
      </DropdownMenuLabel>
      {memberships.map((m) => (
        <Choice key={m.tenant.id} to={`/${m.tenant.slug}`} icon={<Building2Icon />}>
          {m.tenant.name}
        </Choice>
      ))}
    </DropdownMenuGroup>
  )
}

/**
 * The switcher inside a convention: the area of the page, an edition or the convention settings,
 * under the convention's name. It offers the editions the member sees, each on its dashboard, the
 * convention settings to a member who may open them, and the member's other conventions. The
 * levels stay apart (docs/PRODUCT.md, Business model — tenant and edition): the menu below holds one area only.
 */
export function AreaSwitcher() {
  const { t } = useLingui()
  const { tenant, access, api } = useCurrentTenant()
  const memberships = usePermissionStore((state) => state.memberships) ?? []
  const editionSlug = useMatch('/:tenantSlug/editions/:editionSlug/*')?.params.editionSlug
  const inSettings = Boolean(useMatch('/:tenantSlug/settings/*'))
  const editions = useQuery(editionListOptions(api))

  const seen = editions.data?.filter((edition) => access.seesEdition(edition.id)) ?? []
  const edition = seen.find((other) => other.slug === editionSlug)
  const others = memberships.filter((m) => m.tenant.slug !== tenant.slug)

  const shown = edition
    ? { icon: <CalendarDaysIcon />, title: edition.name, subtitle: tenant.name }
    : inSettings
      ? { icon: <Settings2Icon />, title: t`Convention settings`, subtitle: tenant.name }
      : { icon: <Building2Icon />, title: tenant.name }

  return (
    <Switcher {...shown}>
      {seen.length > 0 && (
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            <Trans>Editions</Trans>
          </DropdownMenuLabel>
          {seen.map((other) => (
            <Choice
              key={other.id}
              to={`/${tenant.slug}/editions/${other.slug}`}
              icon={<CalendarDaysIcon />}
            >
              {other.name}
            </Choice>
          ))}
        </DropdownMenuGroup>
      )}
      {access.seesConventionSettings && (
        <>
          {seen.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuGroup>
            <Choice to={`/${tenant.slug}/settings`} icon={<Settings2Icon />}>
              <Trans>Convention settings</Trans>
            </Choice>
          </DropdownMenuGroup>
        </>
      )}
      {others.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <Conventions memberships={others} />
        </>
      )}
    </Switcher>
  )
}

/** The switcher above any convention, on the convention picker and the account page. */
export function ConventionSwitcher() {
  const memberships = usePermissionStore((state) => state.memberships) ?? []
  return (
    <Switcher
      icon={<Building2Icon />}
      title={<Trans>OPOS panel</Trans>}
      subtitle={<Trans>Choose a convention</Trans>}
    >
      <Conventions memberships={memberships} />
    </Switcher>
  )
}
