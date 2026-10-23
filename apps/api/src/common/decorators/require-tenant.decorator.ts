import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { type Level } from '../als/tenant-context.service'
import { JwtAuthGuard } from '../guards/jwt-auth.guard'
import { type Requirement, type TenantResource } from '../permissions/permissions'

export const TENANT_REQUIREMENT = Symbol('TENANT_REQUIREMENT')

/** Marks a tenant route and applies JwtAuthGuard, so a tenant route is never unauthenticated. */
export const tenantRoute = (requirement: Requirement) =>
  applyDecorators(UseGuards(JwtAuthGuard), SetMetadata(TENANT_REQUIREMENT, requirement))

/**
 * A tenant route: the request carries X-Tenant-Slug and runs in that tenant's transaction.
 * Without arguments any membership will do; with them, that tenant-level permission. Put it
 * below a single-route @TsRestHandler (PLAN.md 7.3).
 */
export function RequireTenant(): MethodDecorator
export function RequireTenant(resource: TenantResource, level: Level): MethodDecorator
export function RequireTenant(resource?: TenantResource, level?: Level): MethodDecorator {
  return tenantRoute(resource && level ? { kind: 'tenant', resource, level } : { kind: 'tenant' })
}
