import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo } from 'react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router'
import { tenantApi } from '../../../shared/lib/api'
import { isPermissionDenied } from '../../../shared/lib/errors'
import { clearForbidden, useForbidden } from '../../../shared/lib/forbidden'
import { ErrorMessage, LoadingView, NoPermissionView } from '../../../shared/ui'
import { tenantOptions } from '../api/tenants'
import { atLeast, membershipFor, tenantAccess, usePermissionStore } from '../model/permissions'
import { PanelHeader } from './panel-header'
import { type CurrentTenant, TenantContext } from './tenant-context'

function SidebarLink({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
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
 * The frame of every page inside a tenant: the top bar, the sidebar with the sections the member's
 * permissions open, and the page, or the "no permissions" screen after a `403` (PLAN.md 8).
 */
export function TenantLayout() {
  const { tenantSlug = '' } = useParams()
  const location = useLocation()
  const memberships = usePermissionStore((state) => state.memberships)
  const membership = membershipFor(memberships, tenantSlug)
  const api = tenantApi(tenantSlug)
  const tenant = useQuery({ ...tenantOptions(api), enabled: Boolean(membership) })
  const forbidden = useForbidden((state) => state.forbidden)

  useEffect(() => clearForbidden(), [location.pathname])

  const current = useMemo<CurrentTenant | null>(
    () =>
      membership && tenant.data
        ? { tenant: tenant.data, membership, access: tenantAccess(membership), api }
        : null,
    [membership, tenant.data, api],
  )

  let page: ReactNode
  if (!membership || forbidden || isPermissionDenied(tenant.error)) page = <NoPermissionView />
  else if (tenant.isError) page = <ErrorMessage error={tenant.error} />
  else if (!current) page = <LoadingView />
  else page = <Outlet />

  const base = `/${tenantSlug}`
  return (
    <div className="flex min-h-screen flex-col">
      <PanelHeader tenantSlug={tenantSlug} />
      <div className="flex flex-1 flex-col md:flex-row">
        {current && (
          <nav
            aria-label={current.tenant.name}
            className="border-line bg-surface flex flex-col gap-1 border-b p-3 md:w-56 md:border-r md:border-b-0"
          >
            <p className="text-muted px-3 pb-2 text-xs font-semibold tracking-wide uppercase">
              {current.tenant.name}
            </p>
            <SidebarLink to={base} end>
              <Trans>Dashboard</Trans>
            </SidebarLink>
            <SidebarLink to={`${base}/editions`}>
              <Trans>Editions</Trans>
            </SidebarLink>
            {atLeast(current.access.settings, 'read') && (
              <>
                <SidebarLink to={`${base}/team`}>
                  <Trans>Team</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/settings`}>
                  <Trans>Settings</Trans>
                </SidebarLink>
              </>
            )}
          </nav>
        )}
        <main className="flex-1 p-4 md:p-8">
          <TenantContext.Provider value={current}>{page}</TenantContext.Provider>
        </main>
      </div>
    </div>
  )
}
