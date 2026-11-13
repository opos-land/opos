import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo } from 'react'
import { Outlet, useLocation, useParams } from 'react-router'
import { tenantApi } from '../../../shared/lib/api'
import { isPermissionDenied, isTenantSuspended } from '../../../shared/lib/errors'
import { clearForbidden } from '../../../shared/lib/forbidden'
import { ErrorMessage, LoadingView, NoPermissionView, SuspendedView } from '../../../shared/ui'
import { tenantOptions } from '../api/tenants'
import { membershipFor, tenantAccess, usePermissionStore } from '../model/permissions'
import { ConventionSwitcher } from './area-switcher'
import { PanelFrame } from './panel-frame'
import { type CurrentTenant, TenantContext } from './tenant-context'

/**
 * Every page inside a tenant: the tenant for the area of the page, one edition's or the convention
 * settings, which frames itself with its menu. Without the tenant there is no area, only the
 * "no permissions" screen, an error or the loading view in a frame without one. A convention the
 * admin suspended shows only that, and the API is asked nothing of it.
 */
export function TenantLayout() {
  const { tenantSlug = '' } = useParams()
  const location = useLocation()
  const memberships = usePermissionStore((state) => state.memberships)
  const membership = membershipFor(memberships, tenantSlug)
  const api = tenantApi(tenantSlug)
  const suspended = membership?.tenant.suspended === true
  const tenant = useQuery({ ...tenantOptions(api), enabled: Boolean(membership) && !suspended })

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
  // Suspended as the memberships say, or since they were read.
  else if (suspended || isTenantSuspended(tenant.error)) screen = <SuspendedView />
  else if (tenant.isError) screen = <ErrorMessage error={tenant.error} />
  else if (!current) screen = <LoadingView />

  return (
    <TenantContext.Provider value={current}>
      {screen ? <PanelFrame switcher={<ConventionSwitcher />}>{screen}</PanelFrame> : <Outlet />}
    </TenantContext.Provider>
  )
}
