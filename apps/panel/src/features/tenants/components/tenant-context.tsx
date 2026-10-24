import { type Membership, type Tenant } from '@opos/contract'
import { createContext, useContext } from 'react'
import { type Api } from '../../../shared/lib/api'
import { type TenantAccess } from '../model/permissions'

export interface CurrentTenant {
  tenant: Tenant
  membership: Membership
  access: TenantAccess
  /** The API client of this tenant: every request carries its X-Tenant-Slug. */
  api: Api
}

export const TenantContext = createContext<CurrentTenant | null>(null)

/** The tenant of the page; only pages inside the tenant layout call it. */
export function useCurrentTenant(): CurrentTenant {
  const current = useContext(TenantContext)
  if (!current) throw new Error('useCurrentTenant outside the tenant layout')
  return current
}
