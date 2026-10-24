import { Controller, Module, UseGuards } from '@nestjs/common'
import { editions, tenantMemberships } from '@opos/db'
import { oc } from '@orpc/contract'
import { Implement, implement, ORPCError } from '@orpc/nest'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { TenantContextService } from '../src/common/als/tenant-context.service'
import { GlobalDbService } from '../src/common/database/global-db.service'
import { RequireEdition } from '../src/common/decorators/require-edition.decorator'
import { RequireTenant } from '../src/common/decorators/require-tenant.decorator'
import { ApiError } from '../src/common/errors/api-error'
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard'

// Test-only routes that exercise the tenant transaction and the permission decorators before
// real endpoints use them.

const editionRow = z.object({ id: z.string(), tenantId: z.string() })
const route = oc.$route({ inputStructure: 'detailed' })
const editionParams = z.object({ params: z.object({ editionId: z.string() }) })

export const probeContract = {
  list: route.route({ method: 'GET', path: '/probe/editions' }).output(z.array(editionRow)),
  create: route
    .route({ method: 'POST', path: '/probe/editions', successStatus: 201 })
    .input(
      z.object({
        body: z.object({
          slug: z.string(),
          fail: z.boolean(),
          throws: z.boolean().optional(),
          slow: z.boolean().optional(),
          tenantId: z.string().optional(),
        }),
      }),
    )
    .output(z.object({ id: z.string() })),
  read: route
    .route({ method: 'GET', path: '/probe/editions/{editionId}' })
    .input(editionParams)
    .output(z.object({ ok: z.boolean() })),
  write: route
    .route({ method: 'PUT', path: '/probe/editions/{editionId}' })
    .input(editionParams)
    .output(z.object({ ok: z.boolean() })),
  outside: route.route({ method: 'GET', path: '/probe/outside' }).output(z.object({})),
  demoteHeads: route.route({ method: 'POST', path: '/probe/demote-heads' }).output(z.object({})),
  nested: route.route({ method: 'GET', path: '/probe/nested' }).output(z.object({})),
  withTenant: route
    .route({ method: 'GET', path: '/probe/with-tenant/{slug}' })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(z.array(editionRow)),
}

/** Calls queued with afterCommit, in order; tests clear it. */
export const afterCommitCalls: string[] = []

@Controller()
class ProbeController {
  constructor(
    private readonly context: TenantContextService,
    private readonly global: GlobalDbService,
  ) {}

  private editions() {
    return this.context.tx().select({ id: editions.id, tenantId: editions.tenantId }).from(editions)
  }

  @Implement(probeContract.list)
  @RequireTenant()
  list() {
    return implement(probeContract.list).handler(() => this.editions())
  }

  @Implement(probeContract.create)
  @RequireTenant('settings', 'write')
  create() {
    return implement(probeContract.create).handler(async ({ input: { body } }) => {
      const [row] = await this.context
        .tx()
        .insert(editions)
        .values({
          tenantId: body.tenantId ?? this.context.tenant().id,
          slug: body.slug,
          name: body.slug,
          startsAt: new Date('2027-06-01'),
          endsAt: new Date('2027-06-03'),
        })
        .returning({ id: editions.id })
      // A slow step, like SMTP, keeps the response waiting all the same.
      this.context.afterCommit(async () => {
        if (body.slow) await new Promise((resolve) => setTimeout(resolve, 200))
        afterCommitCalls.push(body.slug)
      })
      if (body.throws) throw new ApiError(409, 'request.invalid', 'Probe failure')
      if (body.fail) throw new ORPCError('CONFLICT', { message: 'Probe failure' })
      return { id: row!.id }
    })
  }

  @Implement(probeContract.read)
  @RequireEdition('program', 'read')
  read() {
    return implement(probeContract.read).handler(() => ({ ok: true }))
  }

  @Implement(probeContract.write)
  @RequireEdition('program', 'write')
  write() {
    return implement(probeContract.write).handler(() => ({ ok: true }))
  }

  @Implement(probeContract.demoteHeads)
  @RequireTenant('settings', 'write')
  demoteHeads() {
    // Breaks the last-head invariant: the deferred trigger rejects it at COMMIT, after the handler.
    return implement(probeContract.demoteHeads).handler(async () => {
      await this.context
        .tx()
        .update(tenantMemberships)
        .set({ role: 'org' })
        .where(eq(tenantMemberships.role, 'head'))
      return {}
    })
  }

  @Implement(probeContract.nested)
  @RequireTenant()
  nested() {
    return implement(probeContract.nested).handler(async () => {
      await this.context.withTenant(this.context.tenant().id, () => this.editions())
      return {}
    })
  }

  @Implement(probeContract.outside)
  @UseGuards(JwtAuthGuard)
  outside() {
    return implement(probeContract.outside).handler(async () => {
      await this.editions()
      return {}
    })
  }

  @Implement(probeContract.withTenant)
  @UseGuards(JwtAuthGuard)
  withTenant() {
    return implement(probeContract.withTenant).handler(async ({ input }) => {
      const tenant = await this.global.tenantBySlug(input.params.slug)
      return this.context.withTenant(tenant!.id, () => this.editions())
    })
  }
}

@Module({ controllers: [ProbeController] })
export class ProbeModule {}
