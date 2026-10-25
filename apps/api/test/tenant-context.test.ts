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
  tenantWithHead,
} from './tenants'

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

  it('answers 403 to an account outside the tenant whether the edition exists or not', async () => {
    await as(outsider, a.slug).get(`/probe/editions/${editionA}`).expect(403)
    await as(outsider, a.slug).get(`/probe/editions/${randomUUID()}`).expect(403)
  })
})
