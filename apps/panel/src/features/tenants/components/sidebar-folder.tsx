import { ChevronRightIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { matchPath, NavLink, useLocation } from 'react-router'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '../../../shared/ui'

/** One section a folder holds: its address and its name. */
export interface FolderLink {
  to: string
  label: ReactNode
}

/**
 * A folder of an area's menu, the `nav-main` of shadcn/ui's `sidebar-07` block: sections that
 * belong together, under one name and folded away until the member opens it. It opens by itself
 * on a page of one of its sections and then stays as the member leaves it; folded over the open
 * page, it carries the mark its section would. A sidebar collapsed to icons has no room for the
 * sections: there the folder is closed, and a press expands the sidebar to show them.
 */
export function SidebarFolder({
  icon,
  title,
  links,
}: {
  icon: ReactNode
  title: ReactNode
  links: FolderLink[]
}) {
  const { pathname } = useLocation()
  const { state, isMobile, setOpen: setSidebarOpen } = useSidebar()
  // A page belongs to the section whose address it is under, as a `NavLink` marks it.
  const holds = (to: string) => matchPath({ path: to, end: false }, pathname) !== null
  const holdsPage = links.some(({ to }) => holds(to))

  const [open, setOpen] = useState(holdsPage)
  // Coming to one of its pages opens the folder; leaving them changes nothing.
  const [heldPage, setHeldPage] = useState(holdsPage)
  if (heldPage !== holdsPage) {
    setHeldPage(holdsPage)
    if (holdsPage) setOpen(true)
  }

  // On a narrow screen the sidebar is a sheet at its full width, whatever the one beside the page is.
  const icons = state === 'collapsed' && !isMobile
  const shown = open && !icons

  return (
    <Collapsible
      open={shown}
      onOpenChange={(next) => {
        if (icons) {
          setSidebarOpen(true)
          setOpen(true)
        } else {
          setOpen(next)
        }
      }}
      className="group/collapsible"
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger
        render={<SidebarMenuButton isActive={holdsPage && !shown} tooltip={{ children: title }} />}
      >
        {icon}
        <span>{title}</span>
        <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {links.map(({ to, label }) => (
            <SidebarMenuSubItem key={to}>
              <SidebarMenuSubButton isActive={holds(to)} render={<NavLink to={to} />}>
                <span>{label}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}
