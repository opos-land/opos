import { type ReactNode } from 'react'
import { NavLink, Outlet, useMatch, useResolvedPath } from 'react-router'
import { useForbidden } from '../../../shared/lib/forbidden'
import {
  NoPermissionView,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../../../shared/ui'
import { AreaSwitcher } from './area-switcher'
import { PanelFrame } from './panel-frame'

/** One section of an area's menu, marked while its page is open; its icon stays when the sidebar collapses. */
export function SidebarLink({
  to,
  end,
  icon,
  children,
}: {
  to: string
  end?: boolean
  icon: ReactNode
  children: ReactNode
}) {
  const { pathname } = useResolvedPath(to)
  const active = Boolean(useMatch({ path: pathname, end: Boolean(end) }))
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={{ children }}
        render={<NavLink to={to} end={end} />}
      >
        {icon}
        <span>{children}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/**
 * One area of the panel: the convention settings or one edition. Its menu stands in the sidebar,
 * under the area switcher, and stays while a `403` gives the page way to the "no permissions"
 * screen.
 */
export function AreaFrame({
  menu,
}: {
  /** The menu of the area, named by `label`; left out until the area knows what it is. */
  menu?: { label: string; title: ReactNode; links: ReactNode }
}) {
  const forbidden = useForbidden((state) => state.forbidden)
  return (
    <PanelFrame
      switcher={<AreaSwitcher />}
      menu={
        menu && (
          <nav aria-label={menu.label}>
            <SidebarGroup>
              <SidebarGroupLabel>{menu.title}</SidebarGroupLabel>
              <SidebarMenu>{menu.links}</SidebarMenu>
            </SidebarGroup>
          </nav>
        )
      }
    >
      {forbidden ? <NoPermissionView /> : <Outlet />}
    </PanelFrame>
  )
}
