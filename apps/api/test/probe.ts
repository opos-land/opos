import { Controller, Module, UseGuards } from '@nestjs/common'
import { editions } from '@opos/db'
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest'
import { initContract } from '@ts-rest/core'
import { z } from 'zod'
import { TenantContextService } from '../src/common/als/tenant-context.service'
import { GlobalDbService } from '../src/common/database/global-db.service'
import { RequireEdition } from '../src/common/decorators/require-edition.decorator'
import { RequireTenant } from '../src/common/decorators/require-tenant.decorator'
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard'

// Test-only routes that exercise the tenant transaction and the permission decorators before
// real endpoints use them.

const c = initContract()
const editionRow = z.object({ id: z.string(), tenantId: z.string() })

export const probeContract = c.router({
  list: { method: 'GET', path: '/probe/editions', responses: { 200: z.array(editionRow) } },
  create: {
    method: 'POST',
    path: '/probe/editions',
    body: z.object({ slug: z.string(), fail: z.boolean() }),
    responses: { 201: z.object({ id: z.string() }), 409: z.object({ code: z.string() }) },
  },
  read: {
    method: 'GET',
    path: '/probe/editions/:editionId',
    responses: { 200: z.object({ ok: z.boolean() }) },
  },
  write: {
    method: 'PUT',
    path: '/probe/editions/:editionId',
    body: z.object({}),
    responses: { 200: z.object({ ok: z.boolean() }) },
  },
  outside: { method: 'GET', path: '/probe/outside', responses: { 200: z.object({}) } },
  withTenant: {
    method: 'GET',
    path: '/probe/with-tenant/:slug',
    responses: { 200: z.array(editionRow) },
  },
})

/** Calls queued with afterCommit, in order; tests clear it. */
export const afterCommitCalls: string[] = []

@Controller()
@UseGuards(JwtAuthGuard)
class ProbeController {
  constructor(
    private readonly context: TenantContextService,
    private readonly global: GlobalDbService,
  ) {}

  private editions() {
    return this.context.tx().select({ id: editions.id, tenantId: editions.tenantId }).from(editions)
  }

  @TsRestHandler(probeContract.list)
  @RequireTenant()
  list() {
    return tsRestHandler(probeContract.list, async () => ({
      status: 200,
      body: await this.editions(),
    }))
  }

  @TsRestHandler(probeContract.create)
  @RequireTenant('settings', 'write')
  create() {
    return tsRestHandler(probeContract.create, async ({ body }) => {
      const [row] = await this.context
        .tx()
        .insert(editions)
        .values({
          tenantId: this.context.tenant().id,
          slug: body.slug,
          name: body.slug,
          startsAt: new Date('2027-06-01'),
          endsAt: new Date('2027-06-03'),
        })
        .returning({ id: editions.id })
      this.context.afterCommit(() => afterCommitCalls.push(body.slug))
      return body.fail
        ? { status: 409, body: { code: 'probe.failed' } }
        : { status: 201, body: { id: row!.id } }
    })
  }

  @TsRestHandler(probeContract.read)
  @RequireEdition('program', 'read')
  read() {
    return tsRestHandler(probeContract.read, () =>
      Promise.resolve({ status: 200 as const, body: { ok: true } }),
    )
  }

  @TsRestHandler(probeContract.write)
  @RequireEdition('program', 'write')
  write() {
    return tsRestHandler(probeContract.write, () =>
      Promise.resolve({ status: 200 as const, body: { ok: true } }),
    )
  }

  @TsRestHandler(probeContract.outside)
  outside() {
    return tsRestHandler(probeContract.outside, async () => {
      await this.editions()
      return { status: 200, body: {} }
    })
  }

  @TsRestHandler(probeContract.withTenant)
  withTenant() {
    return tsRestHandler(probeContract.withTenant, async ({ params }) => {
      const tenant = await this.global.tenantBySlug(params.slug)
      const rows = await this.context.withTenant(tenant!.id, () => this.editions())
      return { status: 200, body: rows }
    })
  }
}

@Module({ controllers: [ProbeController] })
export class ProbeModule {}
