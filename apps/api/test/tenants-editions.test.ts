import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import {
  addEdition,
  addEditionAccess,
  addOrg,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  type Member,
  tenantWithHead,
} from './tenants'

let app: NestExpressApplication
let a: Awaited<ReturnType<typeof tenantWithHead>>
let b: Awaited<ReturnType<typeof tenantWithHead>>
let nobody: Member
let reader: Member
let writer: Member
let limited: Member
let target: Member
let targetId: string
let writerId: string
let editionA: string
let editionB: string

const later = new Date(Date.now() + 30 * 24 * 3600 * 1000)

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
  ;[nobody, reader, writer, limited, target] = await Promise.all([
    member(),
    member(),
    member(),
    member(),
    member(),
  ])
  await addOrg(a.id, nobody)
  await addOrg(a.id, reader, { settings: 'read' })
  writerId = await addOrg(a.id, writer, { settings: 'write' })
  await addOrg(a.id, limited, { settings: 'write', expiresAt: later })
  targetId = await addOrg(a.id, target)
  ;[editionA, editionB] = await Promise.all([addEdition(a.id), addEdition(b.id)])
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
  // Each allowed call is harmless to the shared fixtures; a 404 still proves the check passed.
  const endpoints: { name: string; needs: 'read' | 'write'; run: (who: Member) => request.Test }[] =
    [
      {
        name: 'GET members',
        needs: 'read',
        run: (w) => call(w, 'get', '/tenants/current/members'),
      },
      {
        name: 'GET edition members',
        needs: 'read',
        run: (w) => call(w, 'get', `/editions/${editionA}/members`),
      },
      {
        name: 'PATCH tenant',
        needs: 'write',
        run: (w) => call(w, 'patch', '/tenants/current', {}),
      },
      {
        name: 'PATCH member',
        needs: 'write',
        run: (w) => call(w, 'patch', `/tenants/current/members/${targetId}`, {}),
      },
      {
        name: 'DELETE member',
        needs: 'write',
        run: (w) => call(w, 'delete', `/tenants/current/members/${randomUUID()}`),
      },
      {
        name: 'POST edition',
        needs: 'write',
        run: (w) => call(w, 'post', '/editions', { slug: slug(), name: 'Matrix', ...window }),
      },
      {
        name: 'PATCH edition',
        needs: 'write',
        run: (w) => call(w, 'patch', `/editions/${editionA}`, {}),
      },
      {
        name: 'DELETE edition',
        needs: 'write',
        run: (w) => call(w, 'delete', `/editions/${randomUUID()}`),
      },
      {
        name: 'POST activate',
        needs: 'write',
        run: (w) => call(w, 'post', `/editions/${randomUUID()}/activate`),
      },
      {
        name: 'PUT edition member',
        needs: 'write',
        run: (w) =>
          call(w, 'put', `/editions/${editionA}/members/${targetId}`, {
            programAccess: 'none',
            websiteContentAccess: 'none',
            ticketsAccess: 'none',
          }),
      },
      {
        name: 'DELETE edition member',
        needs: 'write',
        run: (w) => call(w, 'delete', `/editions/${editionA}/members/${randomUUID()}`),
      },
    ]

  const holders = () =>
    [
      ['none', nobody],
      ['read', reader],
      ['write', writer],
      ['head', a.head],
    ] as const

  it.each(endpoints)('$name needs settings=$needs', async ({ needs, run }) => {
    for (const [held, who] of holders()) {
      const allowed = held === 'head' || held === 'write' || (held === 'read' && needs === 'read')
      const res = await run(who)
      if (allowed) expect(res.status, `${held}`).not.toBe(403)
      else expect(res.body, `${held}`).toMatchObject({ code: 'permission.denied' })
    }
  })

  it('lets any member read the tenant and its editions', async () => {
    await call(nobody, 'get', '/tenants/current').expect(200)
    await call(nobody, 'get', '/editions').expect(200)
    await call(nobody, 'get', `/editions/${editionA}`).expect(200)
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

  it('caps an org at their own permissions and expiry', async () => {
    expect((await patch(writer, targetId, { shopConfigAccess: 'read' })).body).toMatchObject({
      code: 'member.above-own',
    })
    expect((await patch(writer, targetId, { role: 'head' })).body).toMatchObject({
      code: 'member.above-own',
    })
    const tooLate = new Date(later.getTime() + 24 * 3600 * 1000).toISOString()
    expect((await patch(limited, targetId, { expiresAt: tooLate })).body).toMatchObject({
      code: 'member.expiry-after-own',
    })
    await patch(writer, targetId, { settingsAccess: 'read' }).expect(200)
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

describe('tenant settings', () => {
  it('changes the name and refuses a taken slug and an unknown time zone', async () => {
    const res = await call(a.head, 'patch', '/tenants/current', { name: 'Renamed' }).expect(200)
    expect(res.body).toMatchObject({ name: 'Renamed', slug: a.slug })

    expect((await call(a.head, 'patch', '/tenants/current', { slug: b.slug })).body).toMatchObject({
      code: 'tenant.slug-taken',
    })
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
})
