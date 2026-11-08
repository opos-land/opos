import { type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useForbidden } from '../../../shared/lib/forbidden'
import { NoPermissionView } from '../../../shared/ui'

/** One section of an area's menu, marked while its page is open. */
export function SidebarLink({
  to,
  end,
  children,
}: {
  to: string
  end?: boolean
  children: ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-box block px-3 py-1.5 text-sm ${isActive ? 'bg-accent text-accent-ink' : 'hover:bg-paper'}`
      }
    >
      {children}
    </NavLink>
  )
}

/**
 * One area of the panel: the convention's or one edition's. Its menu stands beside the
 * page, and stays while a `403` gives the page way to the "no permissions" screen.
 */
export function AreaFrame({
  menu,
}: {
  /** The menu of the area; left out until the area knows what it is. */
  menu?: { label: string; header: ReactNode; links: ReactNode }
}) {
  const forbidden = useForbidden((state) => state.forbidden)
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {menu && (
        <nav
          aria-label={menu.label}
          className="border-line bg-surface flex flex-col gap-1 border-b p-3 md:w-56 md:shrink-0 md:border-r md:border-b-0"
        >
          <div className="flex flex-col gap-2 px-3 pb-2">{menu.header}</div>
          {menu.links}
        </nav>
      )}
      <main className="flex-1 p-4 md:p-8">{forbidden ? <NoPermissionView /> : <Outlet />}</main>
    </div>
  )
}
