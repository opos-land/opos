import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import { afterCommitCalls, ProbeModule } from './probe'
import {
  addEdition,
  addEditionAccess,
  addOrg,
  closeTenantDb,
  countEditions,
  deleteCreatedTenants,
  member,
  type Member,
  openTransaction,
  sleep,
  tenantWithHead,
} from './tenants'
import { tenantWriteLockKey } from '../src/common/permissions/tenant-write-lock'

let app: NestExpressApplication
let a: Awaited<ReturnType<typeof tenantWithHead>>
let b: Awaited<ReturnType<typeof tenantWithHead>>
let editionA: string
let editionB: string
let programReader: Member
let settingsWriter: Member
let expired: Member
let outsider: Member

beforeAll(async () => {
  app = await createApp({}, [ProbeModule])
  await app.listen(0, '127.0.0.1')
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
  ;[editionA, editionB] = await Promise.all([addEdition(a.id), addEdition(b.id)])
  ;[programReader, settingsWriter, expired, outsider] = await Promise.all([
    member(),
    member(),
    member(),
    member(),
  ])
  const readerMembership = await addOrg(a.id, programReader)
  await addEditionAccess(a.id, readerMembership, editionA, { program: 'read' })
  await addOrg(a.id, settingsWriter, { settings: 'write' })
  const expiredMembership = await addOrg(a.id, expired, { settings: 'write', expired: true })
  await addEditionAccess(a.id, expiredMembership, editionA, { program: 'write' })
  // programReader is also an org of B, to check that memberships span tenants.
  await addOrg(b.id, programReader)
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

beforeEach(() => {
  afterCommitCalls.length = 0
})

const as = (who: Member, slug?: string) => {
  const agent = request(app.getHttpServer())
  const auth = (r: request.Test) => {
    r.set('Authorization', `Bearer ${who.token}`)
    return slug ? r.set('X-Tenant-Slug', slug) : r
  }
  return {
    get: (path: string) => auth(agent.get(path)),
    post: (path: string, body: object) => auth(agent.post(path)).send(body),
    put: (path: string) => auth(agent.put(path)).send({}),
  }
}

describe('GET /tenants/current', () => {
  it('returns the tenant to its head and to an org', async () => {
    const res = await as(a.head, a.slug).get('/tenants/current').expect(200)
    expect(res.body).toMatchObject({ id: a.id, slug: a.slug })
    await as(programReader, a.slug).get('/tenants/current').expect(200)
  })

  it('refuses another tenant, an expired org and an account without a membership', async () => {
    for (const [who, slug] of [
      [a.head, b.slug],
      [expired, a.slug],
      [outsider, a.slug],
    ] as const) {
      const res = await as(who, slug).get('/tenants/current').expect(403)
      expect(res.body).toMatchObject({ code: 'permission.denied' })
    }
  })

  it('answers 404 for an unknown slug and 400 without the header', async () => {
    await as(a.head, 'no-such-tenant').get('/tenants/current').expect(404)
    const res = await as(a.head).get('/tenants/current').expect(400)
    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field: 'x-tenant-slug' } })
  })

  it('ignores the header on a route that is not a tenant route', async () => {
    await as(a.head, 'no-such-tenant').get('/me').expect(200)
  })
})

describe('GET /me/memberships', () => {
  it('lists the memberships of every tenant with their edition permissions', async () => {
    const res = await as(programReader).get('/me/memberships').expect(200)
    const body = res.body as { tenant: { id: string }; editions: { editionId: string }[] }[]

    expect(body.map((m) => m.tenant.id).sort()).toEqual([a.id, b.id].sort())
    expect(body.find((m) => m.tenant.id === a.id)).toMatchObject({
      role: 'org',
      editions: [{ editionId: editionA, programAccess: 'read', ticketsAccess: 'none' }],
    })
  })

  it('leaves expired memberships out', async () => {
    const res = await as(expired).get('/me/memberships').expect(200)
    expect(res.body).toEqual([])
  })
})

describe('tenant transaction', () => {
  it('commits a 2xx and runs the after-commit queue', async () => {
    const slug = randomUUID().slice(0, 8)
    await as(settingsWriter, a.slug).post('/probe/editions', { slug, fail: false }).expect(201)

    expect(await countEditions(a.id, slug)).toBe(1)
    expect(afterCommitCalls).toEqual([slug])
  })

  it('holds the response until a slow after-commit queue has run', async () => {
    const slug = randomUUID().slice(0, 8)
    await as(settingsWriter, a.slug)
      .post('/probe/editions', { slug, fail: false, slow: true })
      .expect(201)

    expect(afterCommitCalls).toEqual([slug])
  })

  it('rolls back a refused request and drops the after-commit queue', async () => {
    const slug = randomUUID().slice(0, 8)
    await as(settingsWriter, a.slug).post('/probe/editions', { slug, fail: true }).expect(409)

    expect(await countEditions(a.id, slug)).toBe(0)
    expect(afterCommitCalls).toEqual([])
  })

  it('rolls back a thrown exception and drops the after-commit queue', async () => {
    const slug = randomUUID().slice(0, 8)
    await as(settingsWriter, a.slug)
      .post('/probe/editions', { slug, fail: false, throws: true })
      .expect(409)

    expect(await countEditions(a.id, slug)).toBe(0)
    expect(afterCommitCalls).toEqual([])
  })

  it("refuses a write carrying another tenant's id (WITH CHECK)", async () => {
    const slug = randomUUID().slice(0, 8)
    await as(settingsWriter, a.slug)
      .post('/probe/editions', { slug, fail: false, tenantId: b.id })
      .expect(500)

    expect(await countEditions(b.id, slug)).toBe(0)
  })

  it('refuses a tenant transaction nested in another', async () => {
    await as(a.head, a.slug).get('/probe/nested').expect(500)
  })

  it('checks the tenant permission before the handler runs', async () => {
    const slug = randomUUID().slice(0, 8)
    await as(programReader, a.slug).post('/probe/editions', { slug, fail: false }).expect(403)

    expect(await countEditions(a.id, slug)).toBe(0)
  })

  it("sees only the tenant's own rows", async () => {
    const res = await as(a.head, a.slug).get('/probe/editions').expect(200)
    const rows = res.body as { id: string; tenantId: string }[]

    expect(rows.map((r) => r.id)).toContain(editionA)
    expect(rows.every((r) => r.tenantId === a.id)).toBe(true)
  })

  it('answers 409 when COMMIT breaks the last-head invariant, and keeps the head', async () => {
    const res = await as(a.head, a.slug).post('/probe/demote-heads', {}).expect(409)

    expect(res.body).toMatchObject({ code: 'membership.last-head' })
    await as(a.head, a.slug).get('/tenants/current').expect(200)
  })

  it('serves no tenant when DATABASE_URL names a role that bypasses RLS', async () => {
    const migrator = new URL(process.env.DATABASE_MIGRATION_URL!)
    const bypassing = await createApp({ DATABASE_URL: migrator.toString() })
    try {
      for (const path of ['/tenants/current', '/editions']) {
        const res = await request(bypassing.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${a.head.token}`)
          .set('X-Tenant-Slug', a.slug)
        expect(res.status, path).toBe(500)
        expect(res.body, path).toEqual({ code: 'server.error', message: 'Internal server error' })
      }
    } finally {
      await bypassing.close()
    }
  })

  it('throws when a repository runs outside a tenant transaction', async () => {
    const res = await as(a.head).get('/probe/outside').expect(500)
    expect(res.body).toEqual({ code: 'server.error', message: 'Internal server error' })
  })

  it('opens the same context with withTenant', async () => {
    const res = await as(a.head).get(`/probe/with-tenant/${b.slug}`).expect(200)
    const rows = res.body as { id: string; tenantId: string }[]

    expect(rows.map((r) => r.id)).toEqual([editionB])
  })
})

describe('@RequireEdition', () => {
  it('lets a head into every edition of the tenant', async () => {
    await as(a.head, a.slug).put(`/probe/editions/${editionA}`).expect(200)
  })

  it('applies the edition-level permission', async () => {
    await as(programReader, a.slug).get(`/probe/editions/${editionA}`).expect(200)
    await as(programReader, a.slug).put(`/probe/editions/${editionA}`).expect(403)
  })

  it('ignores tenant-level permissions and expired memberships', async () => {
    await as(settingsWriter, a.slug).get(`/probe/editions/${editionA}`).expect(403)
    await as(expired, a.slug).get(`/probe/editions/${editionA}`).expect(403)
  })

  it("answers 404 for another tenant's edition and for an id that is not a uuid", async () => {
    await as(a.head, a.slug).get(`/probe/editions/${editionB}`).expect(404)
    await as(a.head, a.slug).get('/probe/editions/not-a-uuid').expect(404)
  })

  it("answers 404 to a member of B asking for A's edition in B", async () => {
    await as(programReader, b.slug).get(`/probe/editions/${editionA}`).expect(404)
  })

  // An edition-level write takes the tenant's write lock like a tenant-level one (PLAN.md 7.3):
  // a lower edition permission committed under that lock while the write waits stops it.
  it('refuses an edition write once a lower edition permission commits while it waits', async () => {
    const writer = await member()
    const membership = await addOrg(a.id, writer)
    await addEditionAccess(a.id, membership, editionA, { program: 'write' })
    await as(writer, a.slug).put(`/probe/editions/${editionA}`).expect(200)

    const change = await openTransaction()
    await change.sql`select pg_advisory_xact_lock(${tenantWriteLockKey(a.id)}::bigint)`
    await change.sql`
      update edition_memberships set program_access = 'read'
      where tenant_membership_id = ${membership} and edition_id = ${editionA}
    `
    const pending = as(writer, a.slug)
      .put(`/probe/editions/${editionA}`)
      .then((res) => res)
    await sleep(300)
    await change.commit()

    expect((await pending).status).toBe(403)
  })

  it('answers 403 to an account outside the tenant whether the edition exists or not', async () => {
    await as(outsider, a.slug).get(`/probe/editions/${editionA}`).expect(403)
    await as(outsider, a.slug).get(`/probe/editions/${randomUUID()}`).expect(403)
  })
})

// Writes of one tenant queue inside the API before they open a transaction (PLAN.md 7.3), so a
// tenant with more waiting writes than the pool has connections leaves the pool to the others.
describe('the write queue of a tenant', () => {
  it('keeps connections free for other tenants while the writes of one tenant queue', async () => {
    const writes = Array.from({ length: 12 }, () =>
      as(a.head, a.slug)
        .post('/probe/slow-write', {})
        .then((res) => res),
    )
    await sleep(300)
    const started = Date.now()
    await as(b.head, b.slug).get('/tenants/current').expect(200)
    expect(Date.now() - started).toBeLessThan(500)

    // A write the check refuses is answered at once, not behind the queue.
    const refusedAt = Date.now()
    await as(programReader, a.slug).post('/probe/slow-write', {}).expect(403)
    expect(Date.now() - refusedAt).toBeLessThan(200)

    const statuses = (await Promise.all(writes)).map((res) => res.status)
    expect(statuses.filter((status) => status === 200).length).toBeGreaterThanOrEqual(4)
    expect(statuses.filter((status) => status === 503).length).toBeGreaterThanOrEqual(5)
  }, 20_000)

  // The turn ends with the transaction: the after-commit queue (outbound mail) and the response
  // run while the next write of the tenant already goes ahead.
  it('lets the next write of the tenant run while a slow after-commit step finishes', async () => {
    const order: string[] = []
    const first = as(a.head, a.slug)
      .post('/probe/editions', {
        slug: `queue-${randomUUID().slice(0, 8)}`,
        fail: false,
        slow: true,
      })
      .then((res) => order.push(`first ${res.status}`))
    await sleep(20)
    const second = as(a.head, a.slug)
      .post('/probe/editions', { slug: `queue-${randomUUID().slice(0, 8)}`, fail: false })
      .then((res) => order.push(`second ${res.status}`))
    await Promise.all([first, second])

    expect(order).toEqual(['second 201', 'first 201'])
  })
})
