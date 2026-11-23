import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  type Type,
} from '@nestjs/common'
import { ModuleRef, Reflector } from '@nestjs/core'
import { uploadedFileSchema } from '@opos/contract'
import { from, lastValueFrom, type Observable } from 'rxjs'
import { GlobalDbService } from '../database/global-db.service'
import { CALLS_OUT } from '../decorators/calls-out.decorator'
import { PREPARES, type Preparation } from '../decorators/prepares.decorator'
import { TENANT_REQUIREMENT } from '../decorators/require-tenant.decorator'
import {
  ApiError,
  forbidden,
  notFound,
  tenantSuspended,
  unauthenticated,
} from '../errors/api-error'
import { AccessRepository } from '../permissions/access.repository'
import { decideEdition, decideTenant, type Requirement } from '../permissions/permissions'
import { TenantWriteQueue } from '../permissions/tenant-write-queue'
import { fileTooLarge, fileTypeRefused } from '../../modules/files/errors'
import { FilesService } from '../../modules/files/files.service'
import {
  SERVES_FILE,
  TAKES_FILE,
  type TakesFileOptions,
} from '../../modules/files/takes-file.decorator'
import { isUuid } from '../uuid'
import { TenantContextService } from './tenant-context.service'

interface HttpRequest {
  headers: Record<string, unknown>
  params: Record<string, string | undefined>
  body?: unknown
}

/**
 * For a route marked with @RequireTenant or @RequireEdition: resolves the tenant
 * from X-Tenant-Slug, opens its transaction, loads the membership, checks the permission, runs the
 * handler and commits unless it failed; TenantContextService then sends oRPC's held response.
 * Other routes ignore the header. An account route marked with @TakesFile gets its file received
 * here too, for the session's account, before its handler runs.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: TenantContextService,
    private readonly global: GlobalDbService,
    private readonly access: AccessRepository,
    private readonly queue: TenantWriteQueue,
    private readonly modules: ModuleRef,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const requirement = this.reflector.getAllAndOverride<Requirement | undefined>(
      TENANT_REQUIREMENT,
      [ctx.getHandler(), ctx.getClass()],
    )
    const takesFile = this.reflector.get<TakesFileOptions | undefined>(TAKES_FILE, ctx.getHandler())
    const http = ctx.switchToHttp()
    const request = http.getRequest<HttpRequest>()
    if (!requirement) {
      if (!takesFile) return next.handle() as Observable<unknown>
      return from(this.takeForAccount(takesFile, request, next))
    }

    const response = http.getResponse<{ statusCode: number }>()
    const servesFile = this.reflector.get<boolean | undefined>(SERVES_FILE, ctx.getHandler())
    const prepares = this.reflector.get<Type<Preparation> | undefined>(PREPARES, ctx.getHandler())
    const callsOut = this.reflector.get<boolean | undefined>(CALLS_OUT, ctx.getHandler())
    return from(
      this.handle(requirement, request, response, next, {
        takesFile,
        servesFile,
        prepares,
        callsOut,
      }),
    )
  }

  private async handle(
    requirement: Requirement,
    request: HttpRequest,
    response: { statusCode: number },
    next: CallHandler,
    files: {
      takesFile?: TakesFileOptions
      servesFile?: boolean
      prepares?: Type<Preparation>
      callsOut?: boolean
    } = {},
  ) {
    const slug = request.headers['x-tenant-slug']
    if (typeof slug !== 'string' || !slug) {
      throw new ApiError(400, 'request.invalid', 'Missing X-Tenant-Slug header', {
        field: 'x-tenant-slug',
      })
    }
    const found = await this.global.tenantBySlug(slug)
    if (!found) throw notFound('tenant')
    // Before any transaction or membership: the transaction would refuse it all the same.
    if (found.suspended) throw tenantSuspended()
    const { tenant } = found

    const write = requirement.level === 'write'
    /** Puts the tenant into the store of the open transaction. */
    const enter = () => {
      const store = TenantContextService.store()
      if (!store.account) throw unauthenticated()
      store.tenant = tenant
      return store.account
    }
    /** Reads the account's membership in the tenant into the store and checks the requirement. */
    const admit = async () => {
      const account = enter()
      TenantContextService.store().membership = await this.access.activeMembership(account.id)
      await this.check(requirement, request)
    }
    // An exception rolls back, and so does a status of 300 or more: the one oRPC holds unsent
    // (defer-response.ts), or the one a route outside oRPC set on the response.
    const run = (ended?: () => void) =>
      this.context.transaction(
        tenant.id,
        async () => {
          // A write takes the tenant's write lock before it checks: every route that lowers a
          // member's access is a write, so the check sees each such change committed, and none
          // can land before this transaction ends. The lock comes before any row lock, so it adds
          // no lock-order cycle.
          if (write) {
            enter()
            await this.access.lockTenantWrites()
          }
          await admit()
          return lastValueFrom(next.handle() as Observable<unknown>, { defaultValue: undefined })
        },
        () => (TenantContextService.store().deferredResponse?.status ?? response.statusCode) < 300,
        ended,
      )
    if (files.callsOut && requirement.kind !== 'account') {
      // Its handler writes in transactions of its own, with no write lock: only a route that
      // lowers nobody's access and asks no membership may.
      throw new Error('A route that calls out between its transactions asks no membership')
    }
    if (files.servesFile || files.callsOut) {
      if (write) throw new Error('A route that serves a file is a read')
      // Checked in a short transaction, then run outside every transaction, so the bucket,
      // imgproxy and a payment provider are never waited for inside one (modules/files).
      const membership = await this.context.transaction(tenant.id, async () => {
        await admit()
        return this.context.membership()
      })
      enter()
      TenantContextService.store().membership = membership
      return lastValueFrom(next.handle() as Observable<unknown>, { defaultValue: undefined })
    }
    if (files.takesFile && !write) throw new Error('A route that takes a file is a write')
    /** Runs the preparation outside every transaction, as the tenant whose requirement passed. */
    const prepare = async (prepares: Type<Preparation>) => {
      enter()
      const preparation = this.modules.get<Preparation>(prepares, { strict: false })
      TenantContextService.store().prepared = await preparation.prepare(request.body)
    }
    if (files.prepares && !write) {
      // A read's requirement is judged inside its one transaction, after any call out. Only a
      // route that asks no membership has nothing left to judge: its session passed already.
      if (requirement.kind !== 'account') {
        throw new Error('A route that prepares is a write, or one that asks no membership')
      }
      await prepare(files.prepares)
      return run()
    }
    if (!write) return run()
    // A write is checked once in a short transaction of its own, so a refused one never queues,
    // then waits in its tenant's queue without a connection, then runs and gives its turn back
    // when its transaction ends, before the after-commit queue and the response.
    await this.context.transaction(tenant.id, admit)
    if (files.takesFile) {
      // The tenant whose requirement just passed, under whose keys the bytes lie.
      enter()
      await this.receive(files.takesFile, request)
    }
    // The outbound call the route's transaction then acts on, such as a payment provider's check
    // of credentials.
    if (files.prepares) await prepare(files.prepares)
    return this.queue.run(tenant.id, (release) => run(release))
  }

  /**
   * An account route that takes a file: behind its own guard, with no tenant. The file is received
   * for the session's account, outside every transaction; the handler keeps it in a transaction of
   * the account (TenantContextService.accountTransaction). A kind of a tenant is refused by the
   * storage, which finds no tenant to receive it for.
   */
  private async takeForAccount(
    takesFile: TakesFileOptions,
    request: HttpRequest,
    next: CallHandler,
  ) {
    if (!TenantContextService.store().account) throw unauthenticated()
    await this.receive(takesFile, request)
    return lastValueFrom(next.handle() as Observable<unknown>, { defaultValue: undefined })
  }

  /**
   * The file of a route that takes one, received outside every transaction once the requirement
   * passed; its transaction keeps it, and the sweep removes the bytes when it does not commit.
   */
  private async receive({ kind, field }: TakesFileOptions, request: HttpRequest) {
    const body = request.body as Record<string, unknown> | undefined
    const parsed = uploadedFileSchema.safeParse(body?.[field])
    if (!parsed.success) {
      // A type the storage keeps for no kind and a file over 15 MB answer as the storage does.
      const [issue] = parsed.error.issues
      if (issue?.path[0] === 'type') throw fileTypeRefused()
      if (issue?.path[0] === 'data' && issue.code === 'too_big') throw fileTooLarge()
      throw new ApiError(400, 'request.invalid', 'The file is missing or malformed', { field })
    }
    const files = this.modules.get(FilesService, { strict: false })
    TenantContextService.store().received = await files.receive(kind, parsed.data)
  }

  private async check(requirement: Requirement, request: HttpRequest) {
    if (requirement.kind === 'account') return
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
