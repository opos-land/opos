import { type ReactNode, useEffect } from 'react'
import { useLocation } from 'react-router'
import {
  PageBreadcrumb,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '../../../shared/ui'
import { NavUser } from '../../account'

/**
 * The frame of every signed-in page, shadcn/ui's `sidebar-07` block: the sidebar, collapsing to
 * icons, with the switcher at its head, the menu of the area and the account at its foot; beside
 * it the page, under a bar that toggles the sidebar and says where the page stands. Whether the
 * sidebar is open lives in the `SidebarProvider` above, so it survives a change of area.
 */
export function PanelFrame({
  switcher,
  menu,
  children,
}: {
  switcher: ReactNode
  /** The menu of the area; left out where there is none. */
  menu?: ReactNode
  children: ReactNode
}) {
  // On a narrow screen the sidebar is a sheet over the page: a new page closes it.
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile])

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>{switcher}</SidebarHeader>
        <SidebarContent>{menu}</SidebarContent>
        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <PageBreadcrumb />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </>
  )
}
