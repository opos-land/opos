import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { type Level } from '../als/tenant-context.service'
import { JwtAuthGuard } from '../guards/jwt-auth.guard'
import { type Requirement, type TenantResource } from '../permissions/permissions'

export const TENANT_REQUIREMENT = Symbol('TENANT_REQUIREMENT')

/**
 * Marks a tenant route and applies JwtAuthGuard, so a tenant route is never unauthenticated. A
 * route takes one requirement: @RequireEdition already implies a membership.
 */
export const tenantRoute =
  (requirement: Requirement): MethodDecorator =>
  (target, key, descriptor) => {
    if (Reflect.getMetadata(TENANT_REQUIREMENT, descriptor.value as object)) {
      throw new Error(`${String(key)}: one @RequireTenant or @RequireEdition per route`)
    }
    applyDecorators(UseGuards(JwtAuthGuard), SetMetadata(TENANT_REQUIREMENT, requirement))(
      target,
      key,
      descriptor,
    )
  }

/**
 * A tenant route for any signed-in account, in the team or not (PLAN.md 5.6): it runs in the tenant's
 * transaction with no membership to check. It takes no write lock, so it must not lower anyone's
 * access (PLAN.md 7.3).
 */
export const InTenant = (): MethodDecorator => tenantRoute({ kind: 'account' })

/**
 * A tenant route: the request carries X-Tenant-Slug and runs in that tenant's transaction.
 * Without arguments any membership will do; with them, that tenant-level permission. It goes on a
 * method that implements one contract route with @Implement (PLAN.md 7.3).
 */
export function RequireTenant(): MethodDecorator
export function RequireTenant(resource: TenantResource, level: Level): MethodDecorator
export function RequireTenant(resource?: TenantResource, level?: Level): MethodDecorator {
  return tenantRoute(resource && level ? { kind: 'tenant', resource, level } : { kind: 'tenant' })
}
