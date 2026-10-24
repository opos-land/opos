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
 * handler, commits unless it failed, and only then sends oRPC's response. Other routes ignore the
 * header.
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

    // An error thrown by the handler rolls back. oRPC hands its response over unsent
    // (deferResponseInTenantTransaction); a route outside oRPC has set the status on the response.
    const outcome = await this.context.transaction(
      tenant.id,
      async () => {
        const store = TenantContextService.store()
        if (!store.account) throw unauthenticated()
        store.tenant = tenant
        store.membership = await this.access.activeMembership(store.account.id)
        await this.check(requirement, request)
        const value = await lastValueFrom(next.handle() as Observable<unknown>, {
          defaultValue: undefined,
        })
        return { value, deferred: store.deferredResponse }
      },
      ({ deferred }) => (deferred?.status ?? response.statusCode) < 300,
    )
    // After the commit and its after-commit queue; a COMMIT that failed threw instead.
    if (outcome.deferred) await outcome.deferred.send()
    return outcome.value
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
