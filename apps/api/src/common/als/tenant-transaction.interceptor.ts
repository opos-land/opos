import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { from, lastValueFrom, type Observable } from 'rxjs'
import { GlobalDbService } from '../database/global-db.service'
import { TENANT_REQUIREMENT } from '../decorators/require-tenant.decorator'
import { ApiError, forbidden, notFound, unauthenticated } from '../errors/api-error'
import { AccessRepository } from '../permissions/access.repository'
import { decideEdition, decideTenant, type Requirement } from '../permissions/permissions'
import { isUuid } from '../uuid'
import { TenantContextService } from './tenant-context.service'

interface HttpRequest {
  headers: Record<string, unknown>
  params: Record<string, string | undefined>
}

/**
 * For a route marked with @RequireTenant or @RequireEdition (PLAN.md 7.2): resolves the tenant
 * from X-Tenant-Slug, opens its transaction, loads the membership, checks the permission, runs the
 * handler and commits unless it failed; TenantContextService then sends oRPC's held response.
 * Other routes ignore the header.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: TenantContextService,
    private readonly global: GlobalDbService,
    private readonly access: AccessRepository,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const requirement = this.reflector.getAllAndOverride<Requirement | undefined>(
      TENANT_REQUIREMENT,
      [ctx.getHandler(), ctx.getClass()],
    )
    if (!requirement) return next.handle() as Observable<unknown>

    const http = ctx.switchToHttp()
    const request = http.getRequest<HttpRequest>()
    const response = http.getResponse<{ statusCode: number }>()
    return from(this.handle(requirement, request, response, next))
  }

  private async handle(
    requirement: Requirement,
    request: HttpRequest,
    response: { statusCode: number },
    next: CallHandler,
  ) {
    const slug = request.headers['x-tenant-slug']
    if (typeof slug !== 'string' || !slug) {
      throw new ApiError(400, 'request.invalid', 'Missing X-Tenant-Slug header', {
        field: 'x-tenant-slug',
      })
    }
    const tenant = await this.global.tenantBySlug(slug)
    if (!tenant) throw notFound('tenant')

    // An exception rolls back, and so does a status of 300 or more: the one oRPC holds unsent
    // (defer-response.ts), or the one a route outside oRPC set on the response.
    return this.context.transaction(
      tenant.id,
      async () => {
        const store = TenantContextService.store()
        if (!store.account) throw unauthenticated()
        store.tenant = tenant
        // A write takes the tenant's write lock before it reads the membership, and every route
        // that lowers a member's access is a write: the check then sees each such change
        // committed, and none can land before this transaction ends. The lock is taken before any
        // row lock, so it adds no lock-order cycle (PLAN.md 7.3).
        if (requirement.level === 'write') await this.access.lockTenantWrites()
        store.membership = await this.access.activeMembership(store.account.id)
        await this.check(requirement, request)
        return lastValueFrom(next.handle() as Observable<unknown>, { defaultValue: undefined })
      },
      () => (TenantContextService.store().deferredResponse?.status ?? response.statusCode) < 300,
    )
  }

  private async check(requirement: Requirement, request: HttpRequest) {
    const membership = this.context.membership()
    if (requirement.kind === 'tenant') {
      if (decideTenant(membership, requirement.resource, requirement.level) !== 'allow') {
        throw forbidden()
      }
      return
    }
    // No membership answers 403 before the edition is looked up, so an account outside the
    // tenant cannot tell existing edition ids from absent ones. For a member, another tenant's
    // edition and a malformed id are a 404; this runs before oRPC validates the input.
    if (!membership) throw forbidden()
    const editionId = request.params[requirement.param]
    const editionAccess = isUuid(editionId)
      ? await this.access.editionAccess(membership.id, editionId)
      : undefined
    if (editionAccess === undefined) throw notFound('edition')
    if (
      decideEdition(membership, editionAccess, requirement.resource, requirement.level) !== 'allow'
    ) {
      throw forbidden()
    }
  }
}
