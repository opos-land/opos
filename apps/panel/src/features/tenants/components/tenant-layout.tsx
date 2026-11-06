import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo } from 'react'
import { Outlet, useLocation, useParams } from 'react-router'
import { tenantApi } from '../../../shared/lib/api'
import { isPermissionDenied } from '../../../shared/lib/errors'
import { clearForbidden } from '../../../shared/lib/forbidden'
import { ErrorMessage, LoadingView, NoPermissionView } from '../../../shared/ui'
import { tenantOptions } from '../api/tenants'
import { membershipFor, tenantAccess, usePermissionStore } from '../model/permissions'
import { PanelHeader } from './panel-header'
import { type CurrentTenant, TenantContext } from './tenant-context'

/**
 * The frame of every page inside a tenant: the top bar, then the area of the page, the
 * convention's or one edition's, each with its own menu (PLAN.md 8). Without the tenant there is
 * no area, only the "no permissions" screen, an error or the loading view.
 */
export function TenantLayout() {
  const { tenantSlug = '' } = useParams()
  const location = useLocation()
  const memberships = usePermissionStore((state) => state.memberships)
  const membership = membershipFor(memberships, tenantSlug)
  const api = tenantApi(tenantSlug)
  const tenant = useQuery({ ...tenantOptions(api), enabled: Boolean(membership) })

  useEffect(() => clearForbidden(), [location.pathname])

  const current = useMemo<CurrentTenant | null>(
    () =>
      membership && tenant.data
        ? { tenant: tenant.data, membership, access: tenantAccess(membership), api }
        : null,
    [membership, tenant.data, api],
  )

  let screen: ReactNode = null
  if (!membership || isPermissionDenied(tenant.error)) screen = <NoPermissionView />
  else if (tenant.isError) screen = <ErrorMessage error={tenant.error} />
  else if (!current) screen = <LoadingView />

  return (
    <div className="flex min-h-screen flex-col">
      <PanelHeader tenantSlug={tenantSlug} />
      {screen ? (
        <main className="flex-1 p-4 md:p-8">{screen}</main>
      ) : (
        <TenantContext.Provider value={current}>
          <Outlet />
        </TenantContext.Provider>
      )}
    </div>
  )
}
