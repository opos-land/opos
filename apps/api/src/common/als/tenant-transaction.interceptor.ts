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
import { ApiError } from '../errors/api-error'
import { AccessRepository } from '../permissions/access.repository'
import { decideEdition, decideTenant, type Requirement } from '../permissions/permissions'
import { TenantContextService } from './tenant-context.service'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const forbidden = () => new ApiError(403, 'permission.denied', 'Insufficient permissions')
const notFound = (what: string) => new ApiError(404, 'request.not-found', `Unknown ${what}`)

interface HttpRequest {
  headers: Record<string, unknown>
  params: Record<string, string | undefined>
}

/**
 * For a route marked with @RequireTenant or @RequireEdition (PLAN.md 7.2): resolves the tenant
 * from X-Tenant-Slug, opens its transaction, loads the membership, checks the permission, runs the
 * handler and commits on a status below 300. Other routes ignore the header.
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

    // ts-rest sets the status before the body reaches this interceptor, and it turns both a
    // returned 4xx and a thrown TsRestResponseError into a response, so the status decides.
    return this.context.transaction<unknown>(
      tenant.id,
      async () => {
        const store = TenantContextService.store()
        store.tenant = tenant
        store.membership = await this.access.activeMembership(this.context.account().id)
        await this.check(requirement, request)
        return lastValueFrom(next.handle() as Observable<unknown>, { defaultValue: undefined })
      },
      () => response.statusCode < 300,
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
    // Runs before ts-rest validates the path, so a malformed id is a 404 like a foreign one.
    const editionId = request.params[requirement.param]
    if (!editionId || !UUID.test(editionId) || !(await this.access.editionExists(editionId))) {
      throw notFound('edition')
    }
    const editionAccess = membership
      ? await this.access.editionAccess(membership.id, editionId)
      : null
    if (
      decideEdition(membership, editionAccess, requirement.resource, requirement.level) !== 'allow'
    ) {
      throw forbidden()
    }
  }
}
