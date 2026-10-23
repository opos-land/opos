import { SetMetadata } from '@nestjs/common'
import { type Level } from '../als/tenant-context.service'
import { type Requirement, type TenantResource } from '../permissions/permissions'

export const TENANT_REQUIREMENT = Symbol('TENANT_REQUIREMENT')

/**
 * A tenant route: the request carries X-Tenant-Slug and runs in that tenant's transaction.
 * Without arguments any membership will do; with them, that tenant-level permission.
 */
export const RequireTenant = (resource?: TenantResource, level?: Level) =>
  SetMetadata(TENANT_REQUIREMENT, { kind: 'tenant', resource, level } satisfies Requirement)
