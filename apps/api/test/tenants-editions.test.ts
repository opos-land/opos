import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts, testEmail } from './auth'
import {
  addEdition,
  addEditionAccess,
  addHead,
  addOrg,
  closeTenantDb,
  countHeads,
  deleteCreatedTenants,
  holdOpen,
  member,
  openTransaction,
  sleep,
  type Member,
  tenantState,
  tenantWithHead,
} from './tenants'
import { tenantWriteLockKey } from '../src/common/permissions/tenant-write-lock'
import { tenantRequirements } from './route-needs'

let app: NestExpressApplication
let a: Awaited<ReturnType<typeof tenantWithHead>>
let b: Awaited<ReturnType<typeof tenantWithHead>>
let nobody: Member
let reader: Member
let writer: Member
let target: Member
let targetId: string
let writerId: string
let editionA: string
let editionB: string
let lapsed: Member
let foreignMemberId: string

const later = new Date(Date.now() + 30 * 24 * 3600 * 1000)

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
  ;[nobody, reader, writer, target] = await Promise.all([member(), member(), member(), member()])
  await addOrg(a.id, nobody)
  await addOrg(a.id, reader, { settings: 'read' })
  writerId = await addOrg(a.id, writer, { settings: 'write' })
  targetId = await addOrg(a.id, target)
  ;[editionA, editionB] = await Promise.all([addEdition(a.id), addEdition(b.id)])
  lapsed = await member()
  await addOrg(a.id, lapsed, { settings: 'write', expired: true })
  foreignMemberId = await addOrg(b.id, await member())
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

const call = (who: Member, method: Method, path: string, body?: object, slug = a.slug) => {
  const agent = request(app.getHttpServer())
  const req = agent[method](path)
    .set('Authorization', `Bearer ${who.token}`)
    .set('X-Tenant-Slug', slug)
  return body ? req.send(body) : req
}

const slug = () => randomUUID().slice(0, 8)
const window = { startsAt: '2027-06-01T09:00:00Z', endsAt: '2027-06-03T18:00:00Z' }

describe('permission matrix (settings)', () => {
  const none = { programAccess: 'none', websiteContentAccess: 'none', ticketsAccess: 'none' }
  // Each allowed call is harmless to the shared fixtures and answers exactly `allowed`.
  const endpoints: {
    name: string
    needs: 'read' | 'write'
    allowed: number
    run: (who: Member, slug?: string) => request.Test
  }[] = [
    {
      name: 'GET members',
      needs: 'read',
      allowed: 200,
      run: (w, t) => call(w, 'get', '/tenants/current/members', undefined, t),
    },
    {
      name: 'GET edition members',
      needs: 'read',
      allowed: 200,
      run: (w, t) => call(w, 'get', `/editions/${editionA}/members`, undefined, t),
    },
    {
      name: 'PATCH tenant',
      needs: 'write',
      allowed: 200,
      run: (w, t) => call(w, 'patch', '/tenants/current', {}, t),
    },
    {
      name: 'POST member',
      needs: 'write',
      allowed: 409,
      run: (w, t) => call(w, 'post', '/tenants/current/members', { email: target.email }, t),
    },
    {
      name: 'PATCH member',
      needs: 'write',
      allowed: 200,
      run: (w, t) => call(w, 'patch', `/tenants/current/members/${targetId}`, {}, t),
    },
    {
      name: 'DELETE member',
      needs: 'write',
      allowed: 404,
      run: (w, t) => call(w, 'delete', `/tenants/current/members/${randomUUID()}`, undefined, t),
    },
    {
      name: 'POST edition',
      needs: 'write',
      allowed: 201,
      run: (w, t) => call(w, 'post', '/editions', { slug: slug(), name: 'Matrix', ...window }, t),
    },
    {
      name: 'PATCH edition',
      needs: 'write',
      allowed: 200,
      run: (w, t) => call(w, 'patch', `/editions/${editionA}`, {}, t),
    },
    {
      name: 'DELETE edition',
      needs: 'write',
      allowed: 404,
      run: (w, t) => call(w, 'delete', `/editions/${randomUUID()}`, undefined, t),
    },
    {
      name: 'POST activate',
      needs: 'write',
      allowed: 404,
      run: (w, t) => call(w, 'post', `/editions/${randomUUID()}/activate`, undefined, t),
    },
    {
      name: 'PUT edition member',
      needs: 'write',
      allowed: 200,
      run: (w, t) => call(w, 'put', `/editions/${editionA}/members/${targetId}`, none, t),
    },
    {
      name: 'DELETE edition member',
      needs: 'write',
      allowed: 404,
      run: (w, t) =>
        call(w, 'delete', `/editions/${editionA}/members/${randomUUID()}`, undefined, t),
    },
  ]

  const holders = () =>
    [
      ['none', nobody],
      ['read', reader],
      ['write', writer],
      ['head', a.head],
    ] as const

  it.each(endpoints)('$name needs settings=$needs', async ({ needs, allowed, run }) => {
    for (const [held, who] of holders()) {
      const ok = held === 'head' || held === 'write' || (held === 'read' && needs === 'read')
      const res = await run(who)
      if (ok) expect(res.status, held).toBe(allowed)
      else expect(res.body, held).toMatchObject({ code: 'permission.denied' })
    }
  })

  it.each(endpoints)(
    '$name refuses an expired org and a head of another tenant',
    async ({ run }) => {
      expect((await run(lapsed)).status).toBe(403)
      expect((await run(b.head, a.slug)).status).toBe(403)
    },
  )

  it('lets any member read the tenant and its editions', async () => {
    await call(nobody, 'get', '/tenants/current').expect(200)
    await call(nobody, 'get', '/editions').expect(200)
    await call(nobody, 'get', `/editions/${editionA}`).expect(200)
  })
})

describe('tenant isolation by path id', () => {
  const none = { programAccess: 'none', websiteContentAccess: 'none', ticketsAccess: 'none' }

  it("answers 404 for another tenant's member and edition on every route", async () => {
    const calls = [
      call(a.head, 'patch', `/tenants/current/members/${foreignMemberId}`, {
        settingsAccess: 'read',
      }),
      call(a.head, 'delete', `/tenants/current/members/${foreignMemberId}`),
      call(a.head, 'get', `/editions/${editionB}`),
      call(a.head, 'patch', `/editions/${editionB}`, { name: 'Taken over' }),
      call(a.head, 'delete', `/editions/${editionB}`),
      call(a.head, 'post', `/editions/${editionB}/activate`),
      call(a.head, 'get', `/editions/${editionB}/members`),
      call(a.head, 'put', `/editions/${editionB}/members/${targetId}`, none),
      call(a.head, 'put', `/editions/${editionA}/members/${foreignMemberId}`, none),
      call(a.head, 'delete', `/editions/${editionB}/members/${targetId}`),
      call(a.head, 'post', '/tenants/current/members', {
        email: testEmail(),
        editions: [{ editionId: editionB, ...none }],
      }),
    ]
    const statuses = (await Promise.all(calls)).map((res) => res.status)
    expect(statuses).toEqual(calls.map(() => 404))
  })

  it('answers 404 for a membership id that is not a uuid', async () => {
    const calls = [
      call(a.head, 'patch', '/tenants/current/members/not-a-uuid', { settingsAccess: 'read' }),
      call(a.head, 'delete', '/tenants/current/members/not-a-uuid'),
      call(writer, 'delete', '/tenants/current/members/not-a-uuid'),
      call(a.head, 'put', `/editions/${editionA}/members/not-a-uuid`, none),
      call(a.head, 'delete', `/editions/${editionA}/members/not-a-uuid`),
    ]
    const responses = await Promise.all(calls)
    expect(responses.map((res) => res.status)).toEqual(calls.map(() => 404))
    expect(responses[0]!.body).toMatchObject({ code: 'request.not-found' })
  })
})

describe('anti-escalation', () => {
  const patch = (who: Member, id: string, body: object) =>
    call(who, 'patch', `/tenants/current/members/${id}`, body)

  it('refuses the own membership', async () => {
    const res = await patch(writer, writerId, { brandingAccess: 'none' }).expect(403)
    expect(res.body).toMatchObject({ code: 'member.self' })
  })

  it('leaves heads to heads', async () => {
    const [head] = (await call(a.head, 'get', '/tenants/current/members')).body as {
      id: string
      role: string
    }[]
    expect(head).toMatchObject({ role: 'head' })
    const res = await patch(writer, head!.id, { settingsAccess: 'none' }).expect(403)
    expect(res.body).toMatchObject({ code: 'member.head-only' })
  })

  it('caps an org at their own permissions', async () => {
    expect((await patch(writer, targetId, { shopConfigAccess: 'read' })).body).toMatchObject({
      code: 'member.above-own',
    })
    expect((await patch(writer, targetId, { role: 'head' })).body).toMatchObject({
      code: 'member.above-own',
    })
    await patch(writer, targetId, { settingsAccess: 'read' }).expect(200)
  })

  it('refuses an expiry that does not parse', async () => {
    const res = await patch(writer, targetId, { expiresAt: '2099-01-01T00:00:00+99:00' })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field: 'expiresAt' } })
  })

  it('removes a member with 204 and no body', async () => {
    const leaving = await member()
    const id = await addOrg(a.id, leaving)

    const res = await call(writer, 'delete', `/tenants/current/members/${id}`)
    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    await call(leaving, 'get', '/tenants/current').expect(403)
  })

  it('refuses removing oneself and an org removing a head', async () => {
    expect(
      (await call(writer, 'delete', `/tenants/current/members/${writerId}`)).body,
    ).toMatchObject({
      code: 'member.self',
    })
    const members = (await call(a.head, 'get', '/tenants/current/members')).body as {
      id: string
      role: string
    }[]
    const head = members.find((m) => m.role === 'head')!
    expect(
      (await call(writer, 'delete', `/tenants/current/members/${head.id}`)).body,
    ).toMatchObject({
      code: 'member.head-only',
    })
    expect(
      (await call(writer, 'delete', `/editions/${editionA}/members/${writerId}`)).body,
    ).toMatchObject({ code: 'member.self' })
  })

  it("keeps an expiring org's grants within its own access", async () => {
    const [temp, lasting] = await Promise.all([member(), member()])
    const tempId = await addOrg(a.id, temp, { settings: 'write', expiresAt: later })
    await addEditionAccess(a.id, tempId, editionA, { program: 'write' })
    const lastingId = await addOrg(a.id, lasting, { settings: 'read' })
    await addEditionAccess(a.id, lastingId, editionA, { program: 'read' })
    const program = (programAccess: string) => ({
      programAccess,
      websiteContentAccess: 'none',
      ticketsAccess: 'none',
    })
    const editionPath = `/editions/${editionA}/members/${lastingId}`
    const beyond = new Date(later.getTime() + 24 * 3600 * 1000).toISOString()
    const sooner = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

    // lasting never expires: temp raises none of their permissions and extends no one past `later`.
    expect((await patch(temp, lastingId, { settingsAccess: 'write' })).body).toMatchObject({
      code: 'member.outlives-own',
    })
    expect((await call(temp, 'put', editionPath, program('write'))).body).toMatchObject({
      code: 'member.outlives-own',
    })
    await patch(temp, lastingId, { settingsAccess: 'none' }).expect(200)
    await call(temp, 'put', editionPath, program('none')).expect(200)
    await patch(temp, lastingId, { expiresAt: beyond }).expect(200)
    expect((await patch(temp, lastingId, { expiresAt: null })).body).toMatchObject({
      code: 'member.expiry-after-own',
    })

    // Shortened below `later`, lasting may receive what temp holds, but no longer access.
    await patch(temp, lastingId, { expiresAt: sooner }).expect(200)
    await patch(temp, lastingId, { settingsAccess: 'read' }).expect(200)
    await call(temp, 'put', editionPath, program('read')).expect(200)
    expect((await patch(temp, lastingId, { expiresAt: beyond })).body).toMatchObject({
      code: 'member.expiry-after-own',
    })
  })

  it('lets an org shorten the access of a member who holds more, but not extend it', async () => {
    const strong = await member()
    const strongId = await addOrg(a.id, strong)
    // The writer holds settings=write but branding=none; the member gets branding=read.
    await patch(a.head, strongId, { brandingAccess: 'read' }).expect(200)
    const sooner = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

    await patch(writer, strongId, { expiresAt: later.toISOString() }).expect(200)
    await patch(writer, strongId, { expiresAt: sooner }).expect(200)
    for (const expiresAt of [later.toISOString(), null]) {
      expect((await patch(writer, strongId, { expiresAt })).body).toMatchObject({
        code: 'member.above-own',
      })
    }
  })

  it('lets an org lower a permission it does not hold, but not raise it again', async () => {
    const strong = await member()
    const strongId = await addOrg(a.id, strong)
    // The writer holds branding=none.
    await patch(a.head, strongId, { brandingAccess: 'write' }).expect(200)

    await patch(writer, strongId, { brandingAccess: 'read' }).expect(200)
    expect((await patch(writer, strongId, { brandingAccess: 'write' })).body).toMatchObject({
      code: 'member.above-own',
    })
  })

  it('refuses an org reviving a member who holds more than the org', async () => {
    const strong = await member()
    const strongId = await addOrg(a.id, strong, { settings: 'write', expired: true })
    // The writer holds settings=write but branding=none; give the lapsed member branding=read.
    await patch(a.head, strongId, { brandingAccess: 'read' }).expect(200)

    for (const expiresAt of [null, later.toISOString()]) {
      expect((await patch(writer, strongId, { expiresAt })).body).toMatchObject({
        code: 'member.above-own',
      })
    }
    await call(strong, 'get', '/tenants/current').expect(403)

    await patch(a.head, strongId, { expiresAt: null }).expect(200)
    await call(strong, 'get', '/tenants/current').expect(200)
  })

  it('refuses an org reviving a member who holds more in an edition', async () => {
    const holder = await member()
    const holderId = await addOrg(a.id, holder, { expired: true })
    await addEditionAccess(a.id, holderId, editionA, { program: 'write' })

    const res = await patch(writer, holderId, { expiresAt: null })
    expect(res.body).toMatchObject({ code: 'member.above-own' })
    await call(holder, 'get', '/tenants/current').expect(403)
  })

  it('restores access when a head extends an expired membership', async () => {
    const lapsed = await member()
    const id = await addOrg(a.id, lapsed, { expired: true })
    await call(lapsed, 'get', '/tenants/current').expect(403)

    await patch(a.head, id, { expiresAt: later.toISOString() }).expect(200)
    await call(lapsed, 'get', '/tenants/current').expect(200)
  })

  it('hands the head role over: promote first, then the new head demotes the old one', async () => {
    const t = await tenantWithHead()
    const next = await member()
    const nextId = await addOrg(t.id, next)
    const members = (await call(t.head, 'get', '/tenants/current/members', undefined, t.slug))
      .body as { id: string; role: string }[]
    const oldHeadId = members.find((m) => m.role === 'head')!.id

    await call(
      t.head,
      'patch',
      `/tenants/current/members/${nextId}`,
      { role: 'head' },
      t.slug,
    ).expect(200)
    await call(
      next,
      'patch',
      `/tenants/current/members/${oldHeadId}`,
      { role: 'org' },
      t.slug,
    ).expect(200)
    await call(t.head, 'get', '/tenants/current/members', undefined, t.slug).expect(403)
  })
})

describe('promotion to head', () => {
  it('answers 400 when a head sets an expiry on another head, and 200 to an empty PATCH', async () => {
    const t = await tenantWithHead()
    const other = await member()
    const otherId = await addOrg(t.id, other)
    const path = `/tenants/current/members/${otherId}`
    await call(t.head, 'patch', path, { role: 'head' }, t.slug).expect(200)

    const res = await call(t.head, 'patch', path, { expiresAt: later.toISOString() }, t.slug)
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field: 'expiresAt' } })
    await call(t.head, 'patch', path, {}, t.slug).expect(200)
  })

  it('drops edition access on promotion, so a later demotion does not restore it', async () => {
    const t = await tenantWithHead()
    const edition = await addEdition(t.id)
    const promoted = await member()
    const id = await addOrg(t.id, promoted)
    await addEditionAccess(t.id, id, edition, { program: 'write' })
    const path = `/tenants/current/members/${id}`

    await call(t.head, 'patch', path, { role: 'head' }, t.slug).expect(200)
    await call(t.head, 'patch', path, { role: 'org' }, t.slug).expect(200)

    const list = (await call(t.head, 'get', `/editions/${edition}/members`, undefined, t.slug))
      .body as { tenantMembershipId: string }[]
    expect(list.map((m) => m.tenantMembershipId)).not.toContain(id)
  })

  it('resets tenant-level permissions on promotion, so a later demotion does not restore them', async () => {
    const t = await tenantWithHead()
    const promoted = await member()
    const id = await addOrg(t.id, promoted, { settings: 'write' })
    const path = `/tenants/current/members/${id}`

    await call(t.head, 'patch', path, { role: 'head', shopConfigAccess: 'write' }, t.slug).expect(
      200,
    )
    const res = await call(t.head, 'patch', path, { role: 'org' }, t.slug).expect(200)

    expect(res.body).toMatchObject({
      role: 'org',
      settingsAccess: 'none',
      brandingAccess: 'none',
      shopConfigAccess: 'none',
    })
  })

  it('keeps tenant-level permissions of a head at none, so a later demotion does not grant them', async () => {
    const t = await tenantWithHead()
    const promoted = await member()
    const id = await addOrg(t.id, promoted)
    const path = `/tenants/current/members/${id}`
    await call(t.head, 'patch', path, { role: 'head' }, t.slug).expect(200)

    const head = await call(
      t.head,
      'patch',
      path,
      { settingsAccess: 'write', brandingAccess: 'read', shopConfigAccess: 'write' },
      t.slug,
    ).expect(200)
    const res = await call(t.head, 'patch', path, { role: 'org' }, t.slug).expect(200)

    const none = { settingsAccess: 'none', brandingAccess: 'none', shopConfigAccess: 'none' }
    expect(head.body).toMatchObject({ role: 'head', ...none })
    expect(res.body).toMatchObject({ role: 'org', ...none })
  })

  it('applies tenant-level permissions sent with a demotion', async () => {
    const t = await tenantWithHead()
    const promoted = await member()
    const id = await addOrg(t.id, promoted)
    const path = `/tenants/current/members/${id}`
    await call(t.head, 'patch', path, { role: 'head' }, t.slug).expect(200)

    const res = await call(
      t.head,
      'patch',
      path,
      { role: 'org', brandingAccess: 'read' },
      t.slug,
    ).expect(200)

    expect(res.body).toMatchObject({
      role: 'org',
      settingsAccess: 'none',
      brandingAccess: 'read',
      shopConfigAccess: 'none',
    })
  })
})

// Each test holds a row lock from outside, so the requests really overlap (PLAN.md 15.1).
describe('concurrency', () => {
  it('re-checks the target after waiting: an org cannot delete a member promoted meanwhile', async () => {
    const t = await tenantWithHead()
    const [org, promoted] = await Promise.all([member(), member()])
    await addOrg(t.id, org, { settings: 'write' })
    const promotedId = await addOrg(t.id, promoted)
    const commit = await holdOpen(
      (sql) => sql`update tenant_memberships set role = 'head' where id = ${promotedId}`,
    )

    const pending = call(
      org,
      'delete',
      `/tenants/current/members/${promotedId}`,
      undefined,
      t.slug,
    ).then((res) => res)
    await sleep(300)
    await commit()

    expect((await pending).body).toMatchObject({ code: 'member.head-only' })
    const members = (await call(t.head, 'get', '/tenants/current/members', undefined, t.slug))
      .body as { id: string }[]
    expect(members.map((m) => m.id)).toContain(promotedId)
  })

  // Every API route that lowers a member's access is a write route and runs under the tenant's
  // write lock (PLAN.md 7.3). These tests hold that lock in a transaction of their own, lower the
  // actor's access in it and commit while the actor's write waits: the write must read the
  // committed change, refuse with 403 and leave the tenant as it was.
  describe('a write while a change to its actor commits', () => {
    interface Setup {
      t: Awaited<ReturnType<typeof tenantWithHead>>
      edition: string
      org: Member
      orgId: string
      otherId: string
      newcomer: Member
    }
    type Request = { method: Method; path: string; body?: object }
    const noEdition = { programAccess: 'none', websiteContentAccess: 'none', ticketsAccess: 'none' }

    // A request each write route accepts from the org of setup(), and that writes something.
    const writes: Record<string, (s: Setup) => Request> = {
      'tenants.update': () => ({
        method: 'patch',
        path: '/tenants/current',
        body: { name: 'Late' },
      }),
      'tenants.members.invite': (s) => ({
        method: 'post',
        path: '/tenants/current/members',
        body: { email: s.newcomer.email },
      }),
      'tenants.members.update': (s) => ({
        method: 'patch',
        path: `/tenants/current/members/${s.otherId}`,
        body: { settingsAccess: 'read' },
      }),
      'tenants.members.remove': (s) => ({
        method: 'delete',
        path: `/tenants/current/members/${s.otherId}`,
      }),
      'editions.create': () => ({
        method: 'post',
        path: '/editions',
        body: { slug: slug(), name: 'Late', ...window },
      }),
      'editions.update': (s) => ({
        method: 'patch',
        path: `/editions/${s.edition}`,
        body: { name: 'Late' },
      }),
      'editions.remove': (s) => ({ method: 'delete', path: `/editions/${s.edition}` }),
      'editions.activate': (s) => ({ method: 'post', path: `/editions/${s.edition}/activate` }),
      'editions.members.put': (s) => ({
        method: 'put',
        path: `/editions/${s.edition}/members/${s.otherId}`,
        body: { ...noEdition, programAccess: 'read' },
      }),
      'editions.members.remove': (s) => ({
        method: 'delete',
        path: `/editions/${s.edition}/members/${s.otherId}`,
      }),
    }

    /** A tenant whose org holds settings=write and program=write, and another org to act on. */
    async function setup(org: { expiresAt?: Date } = {}): Promise<Setup> {
      const t = await tenantWithHead()
      const edition = await addEdition(t.id)
      const [actor, other, newcomer] = await Promise.all([member(), member(), member()])
      const orgId = await addOrg(t.id, actor, { settings: 'write', ...org })
      await addEditionAccess(t.id, orgId, edition, { program: 'write' })
      const otherId = await addOrg(t.id, other)
      await addEditionAccess(t.id, otherId, edition, {})
      return { t, edition, org: actor, orgId, otherId, newcomer }
    }

    const send = (s: Setup, { method, path, body }: Request) =>
      call(s.org, method, path, body, s.t.slug).then((res) => res)

    const lockTenantWrites = (
      sql: Awaited<ReturnType<typeof openTransaction>>['sql'],
      t: Setup['t'],
    ) => sql`select pg_advisory_xact_lock(${tenantWriteLockKey(t.id)}::bigint)`

    it('covers every write route of the contract', () => {
      const routes = Object.entries(tenantRequirements)
        .filter(([, need]) => need.scope !== 'member' && need.level === 'write')
        .map(([name]) => name)
      expect(Object.keys(writes).sort()).toEqual(routes.sort())
    })

    it.each(Object.entries(writes))(
      '%s refuses once a demotion of its actor commits, and changes nothing',
      async (_, build) => {
        const control = await setup()
        expect((await send(control, build(control))).status, 'without the demotion').toBeLessThan(
          300,
        )

        const s = await setup()
        const expected = await tenantState(s.t.id)
        expected.memberships = expected.memberships.map((row) =>
          row.id === s.orgId ? { ...row, settings_access: 'none' } : row,
        )
        const demotion = await openTransaction()
        await lockTenantWrites(demotion.sql, s.t)
        await demotion.sql`update tenant_memberships set settings_access = 'none' where id = ${s.orgId}`

        const pending = send(s, build(s))
        await sleep(300)
        await demotion.commit()

        const res = await pending
        expect(res.status).toBe(403)
        expect(res.body).toMatchObject({ code: 'permission.denied' })
        expect(await tenantState(s.t.id)).toEqual(expected)
      },
    )

    // Anti-escalation already refuses an expiring org most member changes, so this covers the
    // routes that check nothing but the permission.
    it.each(Object.entries(writes).filter(([name]) => !name.includes('members')))(
      '%s refuses once the access of its actor ends while it waits',
      async (_, build) => {
        const s = await setup({ expiresAt: new Date(Date.now() + 400) })
        const expected = await tenantState(s.t.id)
        const holder = await openTransaction()
        await lockTenantWrites(holder.sql, s.t)

        const pending = send(s, build(s))
        await sleep(800)
        await holder.commit()

        const res = await pending
        expect(res.status).toBe(403)
        expect(await tenantState(s.t.id)).toEqual(expected)
      },
    )

    // A member change locks memberships first and the tenant or edition rows after. A write that
    // locked a membership after its own rows would deadlock against it; these lock like a member
    // change, from outside, and expect both sides to finish.
    it('lets a tenant write finish beside a member change that locked its actor', async () => {
      const s = await setup()
      const change = await openTransaction()
      await change.sql`select 1 from tenant_memberships where id = ${s.orgId} for update`

      const pending = send(s, writes['tenants.update']!(s))
      await sleep(300)
      const tenantLock = change.sql`select 1 from tenants where id = ${s.t.id} for no key update`
      const [res, lock] = await Promise.allSettled([pending, tenantLock])
      await change.rollback()

      expect(lock.status).toBe('fulfilled')
      expect(res.status === 'fulfilled' && res.value.status).toBe(200)
    })

    it('lets an edition delete finish beside a member change that locked its actor', async () => {
      const s = await setup()
      const change = await openTransaction()
      await change.sql`select 1 from tenant_memberships where id = ${s.orgId} for update`

      const pending = send(s, writes['editions.remove']!(s))
      await sleep(300)
      const rowsLock = change.sql`delete from edition_memberships where tenant_membership_id = ${s.orgId}`
      const [res, lock] = await Promise.allSettled([pending, rowsLock])
      await change.rollback()

      expect(lock.status).toBe('fulfilled')
      expect(res.status === 'fulfilled' && res.value.status).toBe(204)
    })
  })

  it('serves concurrent requests of two tenants each from its own tenant', async () => {
    const [x, y] = await Promise.all([tenantWithHead(), tenantWithHead()])
    const [editionX, editionY] = await Promise.all([addEdition(x.id), addEdition(y.id)])

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        i % 2 === 0
          ? call(x.head, 'get', '/editions', undefined, x.slug).then((res) => ['x', res] as const)
          : call(y.head, 'get', '/editions', undefined, y.slug).then((res) => ['y', res] as const),
      ),
    )

    for (const [tenant, res] of responses) {
      expect(res.status).toBe(200)
      expect((res.body as { id: string }[]).map((e) => e.id)).toEqual([
        tenant === 'x' ? editionX : editionY,
      ])
    }
  })

  it('serialises two activations, leaving exactly one active edition', async () => {
    const t = await tenantWithHead()
    const [x, y] = await Promise.all([addEdition(t.id), addEdition(t.id)])
    const commit = await holdOpen((sql) => sql`select 1 from editions where id = ${y} for update`)

    const first = call(t.head, 'post', `/editions/${y}/activate`, undefined, t.slug).then((r) => r)
    await sleep(300)
    const second = call(t.head, 'post', `/editions/${x}/activate`, undefined, t.slug).then((r) => r)
    await sleep(300)
    await commit()

    expect([(await first).status, (await second).status]).toEqual([200, 200])
    const all = (await call(t.head, 'get', '/editions', undefined, t.slug)).body as {
      isActive: boolean
    }[]
    expect(all.filter((e) => e.isActive)).toHaveLength(1)
  })

  it('answers 404 to an edition delete that waited for a concurrent delete', async () => {
    const t = await tenantWithHead()
    const edition = await addEdition(t.id)
    const commit = await holdOpen((sql) => sql`delete from editions where id = ${edition}`)

    const pending = call(t.head, 'delete', `/editions/${edition}`, undefined, t.slug).then(
      (res) => res,
    )
    await sleep(300)
    await commit()

    expect((await pending).status).toBe(404)
  })

  it('answers 404 to an edition access change that waited for the edition to be deleted', async () => {
    const t = await tenantWithHead()
    const edition = await addEdition(t.id)
    const orgId = await addOrg(t.id, await member())
    const commit = await holdOpen((sql) => sql`delete from editions where id = ${edition}`)

    const body = { programAccess: 'write', websiteContentAccess: 'none', ticketsAccess: 'none' }
    const pending = call(t.head, 'put', `/editions/${edition}/members/${orgId}`, body, t.slug).then(
      (res) => res,
    )
    await sleep(300)
    await commit()

    expect((await pending).status).toBe(404)
  })

  it('keeps a head when two heads demote each other at once', async () => {
    const t = await tenantWithHead()
    const second = await member()
    const secondId = await addOrg(t.id, second)
    await call(
      t.head,
      'patch',
      `/tenants/current/members/${secondId}`,
      { role: 'head' },
      t.slug,
    ).expect(200)
    const members = (await call(t.head, 'get', '/tenants/current/members', undefined, t.slug))
      .body as { id: string; role: string }[]
    const firstId = members.find((m) => m.role === 'head' && m.id !== secondId)!.id

    const results = await Promise.all([
      call(t.head, 'patch', `/tenants/current/members/${secondId}`, { role: 'org' }, t.slug),
      call(second, 'patch', `/tenants/current/members/${firstId}`, { role: 'org' }, t.slug),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 403])
    expect(await countHeads(t.id)).toBe(1)
  })
})

describe('tenant settings', () => {
  it('changes the name and refuses a slug and an unknown time zone', async () => {
    const res = await call(a.head, 'patch', '/tenants/current', { name: 'Renamed' }).expect(200)
    expect(res.body).toMatchObject({ name: 'Renamed', slug: a.slug })

    // The slug changes only through the admin's script (PLAN.md 14).
    expect(
      (await call(a.head, 'patch', '/tenants/current', { slug: 'renamed-tenant' })).body,
    ).toMatchObject({ code: 'request.invalid', params: { field: 'slug' } })
    expect(
      (await call(a.head, 'patch', '/tenants/current', { timezone: 'Mars/Olympus' })).body,
    ).toMatchObject({ code: 'request.invalid', params: { field: 'timezone' } })
  })
})

describe('editions', () => {
  it('creates an inactive, unpublished edition and refuses a taken slug or a bad window', async () => {
    const s = slug()
    const res = await call(a.head, 'post', '/editions', { slug: s, name: 'New', ...window }).expect(
      201,
    )
    expect(res.body).toMatchObject({ slug: s, isActive: false, isPublished: false })

    expect(
      (await call(a.head, 'post', '/editions', { slug: s, name: 'Again', ...window })).body,
    ).toMatchObject({ code: 'edition.slug-taken' })
    expect(
      (
        await call(a.head, 'post', '/editions', {
          slug: slug(),
          name: 'Backwards',
          startsAt: window.endsAt,
          endsAt: window.startsAt,
        })
      ).body,
    ).toMatchObject({ code: 'request.invalid', params: { field: 'endsAt' } })
    expect(
      (
        await call(a.head, 'post', '/editions', {
          slug: slug(),
          name: 'Offset',
          ...window,
          startsAt: '2027-06-01T09:00:00+99:00',
        })
      ).body,
    ).toMatchObject({ code: 'request.invalid', params: { field: 'startsAt' } })
  })

  it('switches the active edition and refuses to delete it', async () => {
    const first = (
      await call(a.head, 'post', '/editions', { slug: slug(), name: 'One', ...window })
    ).body as { id: string }
    const second = (
      await call(a.head, 'post', '/editions', { slug: slug(), name: 'Two', ...window })
    ).body as { id: string }

    await call(a.head, 'post', `/editions/${first.id}/activate`).expect(200)
    await call(a.head, 'post', `/editions/${second.id}/activate`).expect(200)
    const all = (await call(a.head, 'get', '/editions')).body as { id: string; isActive: boolean }[]
    expect(all.filter((e) => e.isActive).map((e) => e.id)).toEqual([second.id])

    expect((await call(a.head, 'delete', `/editions/${second.id}`)).body).toMatchObject({
      code: 'edition.active',
    })
    await call(a.head, 'delete', `/editions/${first.id}`).expect(204)
  })

  it('publishes an edition', async () => {
    const res = await call(a.head, 'patch', `/editions/${editionA}`, { isPublished: true }).expect(
      200,
    )
    expect(res.body).toMatchObject({ isPublished: true })
  })

  it("answers 404 for another tenant's edition", async () => {
    await call(a.head, 'get', `/editions/${editionB}`).expect(404)
    await call(a.head, 'patch', `/editions/${editionB}`, { name: 'Taken over' }).expect(404)
  })
})

describe('edition members', () => {
  const none = { programAccess: 'none', websiteContentAccess: 'none', ticketsAccess: 'none' }

  it('grants an org access to an edition and shows it in their memberships', async () => {
    await call(a.head, 'put', `/editions/${editionA}/members/${targetId}`, {
      ...none,
      programAccess: 'write',
    }).expect(200)

    const list = (await call(a.head, 'get', `/editions/${editionA}/members`)).body as {
      tenantMembershipId: string
    }[]
    expect(list.map((m) => m.tenantMembershipId)).toContain(targetId)
    const own = (await call(target, 'get', '/me/memberships')).body as {
      editions: { editionId: string; programAccess: string }[]
    }[]
    expect(own[0]!.editions).toContainEqual(
      expect.objectContaining({ editionId: editionA, programAccess: 'write' }),
    )

    await call(a.head, 'delete', `/editions/${editionA}/members/${targetId}`).expect(204)
  })

  it('refuses a head as a target and caps an org at their own edition access', async () => {
    const members = (await call(a.head, 'get', '/tenants/current/members')).body as {
      id: string
      role: string
    }[]
    const head = members.find((m) => m.role === 'head')!
    expect(
      (await call(writer, 'put', `/editions/${editionA}/members/${head.id}`, none)).body,
    ).toMatchObject({ code: 'member.head-only' })

    expect(
      (
        await call(writer, 'put', `/editions/${editionA}/members/${targetId}`, {
          ...none,
          programAccess: 'read',
        })
      ).body,
    ).toMatchObject({ code: 'member.above-own' })
    await addEditionAccess(a.id, writerId, editionA, { program: 'read' })
    await call(writer, 'put', `/editions/${editionA}/members/${targetId}`, {
      ...none,
      programAccess: 'read',
    }).expect(200)
  })

  it('answers 409 member.is-head when a head targets the edition row of another head', async () => {
    const t = await tenantWithHead()
    const edition = await addEdition(t.id)
    const other = await member()
    await addHead(t.id, other)
    const members = (await call(t.head, 'get', '/tenants/current/members', undefined, t.slug))
      .body as { id: string; account: { id: string } }[]
    const otherId = members.find((m) => m.account.id === other.id)!.id

    for (const res of [
      await call(t.head, 'put', `/editions/${edition}/members/${otherId}`, none, t.slug),
      await call(t.head, 'delete', `/editions/${edition}/members/${otherId}`, undefined, t.slug),
    ]) {
      expect(res.status).toBe(409)
      expect(res.body).toMatchObject({ code: 'member.is-head' })
    }
  })

  it("refuses an org removing a head's edition row", async () => {
    const members = (await call(a.head, 'get', '/tenants/current/members')).body as {
      id: string
      role: string
    }[]
    const head = members.find((m) => m.role === 'head')!
    const res = await call(writer, 'delete', `/editions/${editionA}/members/${head.id}`)
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'member.head-only' })
  })

  it('refuses an org changing or removing its own edition row', async () => {
    for (const res of [
      await call(writer, 'put', `/editions/${editionA}/members/${writerId}`, none),
      await call(writer, 'delete', `/editions/${editionA}/members/${writerId}`),
    ]) {
      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: 'member.self' })
    }
  })

  it('lets an org change one edition permission of a member who holds more elsewhere', async () => {
    const t = await tenantWithHead()
    const edition = await addEdition(t.id)
    const [actor, held] = await Promise.all([member(), member()])
    const actorId = await addOrg(t.id, actor, { settings: 'write' })
    await addEditionAccess(t.id, actorId, edition, { program: 'write' })
    const heldId = await addOrg(t.id, held)
    await addEditionAccess(t.id, heldId, edition, { tickets: 'write' })

    const body = { ...none, programAccess: 'write', ticketsAccess: 'write' }
    await call(actor, 'put', `/editions/${edition}/members/${heldId}`, body, t.slug).expect(200)
  })
})
