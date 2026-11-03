import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import {
  addEdition,
  addLike,
  addOrg,
  addProgramItem,
  closeTenantDb,
  countLikes,
  deleteCreatedTenants,
  holdOpen,
  member,
  type Member,
  sleep,
  tenantWithHead,
} from './tenants'

// Likes and the personal schedule (PLAN.md 5.2, 5.6): any signed-in account, no membership needed.

type Tenant = Awaited<ReturnType<typeof tenantWithHead>>

let app: NestExpressApplication
let a: Tenant
let b: Tenant
let fan: Member

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
  fan = await member()
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

const likePath = (editionId: string, itemId: string) =>
  `/editions/${editionId}/program-items/${itemId}/like`

const like = (who: Member, editionId: string, itemId: string, slug = a.slug) =>
  request(app.getHttpServer())
    .put(likePath(editionId, itemId))
    .use(session(who.token))
    .set('X-Tenant-Slug', slug)

const unlike = (who: Member, editionId: string, itemId: string, slug = a.slug) =>
  request(app.getHttpServer())
    .delete(likePath(editionId, itemId))
    .use(session(who.token))
    .set('X-Tenant-Slug', slug)

const schedule = (who: Member) =>
  request(app.getHttpServer()).get('/me/schedule').use(session(who.token))

const DAY = 24 * 3600 * 1000
const days = (count: number) => new Date(Date.now() + count * DAY).toISOString()

/** A published edition that has not ended, with one item. */
async function published(tenantId: string, values: Parameters<typeof addEdition>[1] = {}) {
  const slug = randomUUID().slice(0, 8)
  const editionId = await addEdition(tenantId, {
    slug,
    isPublished: true,
    startsAt: days(30),
    endsAt: days(32),
    ...values,
  })
  return { slug, editionId, item: await addProgramItem(tenantId, editionId) }
}

const likeCount = async (tenant: Tenant, slug: string, item: string) =>
  (
    (
      await request(app.getHttpServer())
        .get(`/public/tenants/${tenant.slug}/editions/${slug}/program-items/${item}`)
        .expect(200)
    ).body as { likeCount: number }
  ).likeCount

describe('likes', () => {
  it('counts a like once, however often it is sent, without a membership', async () => {
    const { slug, editionId, item } = await published(a.id)

    await like(fan, editionId, item).expect(204)
    await like(fan, editionId, item).expect(204)

    expect(await likeCount(a, slug, item)).toBe(1)
  })

  it('takes a like away, also one that is not there', async () => {
    const { slug, editionId, item } = await published(a.id)
    await like(fan, editionId, item).expect(204)

    await unlike(fan, editionId, item).expect(204)
    await unlike(fan, editionId, item).expect(204)

    expect(await likeCount(a, slug, item)).toBe(0)
  })

  it('keeps the like of one account apart from another', async () => {
    const { slug, editionId, item } = await published(a.id)
    const other = await member()
    await like(fan, editionId, item).expect(204)
    await like(other, editionId, item).expect(204)

    await unlike(fan, editionId, item).expect(204)

    expect(await likeCount(a, slug, item)).toBe(1)
  })

  it('lets a member of the team like too', async () => {
    const { editionId, item } = await published(a.id)
    const org = await member()
    await addOrg(a.id, org)

    await like(org, editionId, item).expect(204)
  })

  it('answers 404 for an item of an unpublished edition, as for an unknown one', async () => {
    const draft = await addEdition(a.id)
    const item = await addProgramItem(a.id, draft)

    const hidden = await like(fan, draft, item).expect(404)
    const unknown = await like(fan, draft, randomUUID()).expect(404)

    expect(hidden.body).toEqual(unknown.body)
  })

  it('answers 404 for an item through another edition or another tenant', async () => {
    const here = await published(a.id)
    const there = await published(a.id)
    const foreign = await published(b.id)

    await like(fan, here.editionId, there.item).expect(404)
    await unlike(fan, here.editionId, there.item).expect(404)
    await like(fan, here.editionId, foreign.item).expect(404)
    await like(fan, foreign.editionId, foreign.item, a.slug).expect(404)
    await like(fan, here.editionId, 'not-a-uuid').expect(404)
  })

  it('takes no new like once the edition has ended, but lets one go', async () => {
    const past = await published(a.id, { startsAt: days(-3), endsAt: days(-1) })

    const res = await like(fan, past.editionId, past.item).expect(409)
    expect(res.body).toMatchObject({ code: 'like.edition-ended' })

    await addLike(a.id, past.item, fan.id)
    await unlike(fan, past.editionId, past.item).expect(204)
    expect(await countLikes(past.item)).toBe(0)
  })

  it('lets a like go once its edition is unpublished', async () => {
    const draft = await addEdition(a.id)
    const item = await addProgramItem(a.id, draft)
    await addLike(a.id, item, fan.id)

    await unlike(fan, draft, item).expect(204)

    expect(await countLikes(item)).toBe(0)
  })

  it('answers the removal of an unpublished item without a like as for an unknown one', async () => {
    const draft = await addEdition(a.id)
    const item = await addProgramItem(a.id, draft)

    const hidden = await unlike(fan, draft, item).expect(404)
    const unknown = await unlike(fan, draft, randomUUID()).expect(404)

    expect(hidden.body).toEqual(unknown.body)
  })

  it('answers 404 once the delete of the item commits while the like waits', async () => {
    const { editionId, item } = await published(a.id)
    const commit = await holdOpen((sql) => sql`delete from program_items where id = ${item}`)

    const pending = like(fan, editionId, item).then((res) => res)
    await sleep(300)
    await commit()

    expect((await pending).status).toBe(404)
  })

  it('refuses a request without a token, and answers 404 for an unknown tenant', async () => {
    const { editionId, item } = await published(a.id)

    await request(app.getHttpServer())
      .put(likePath(editionId, item))
      .set('X-Tenant-Slug', a.slug)
      .expect(401)
    await like(fan, editionId, item, 'no-such-convention').expect(404)
  })

  it('never returns who liked an item', async () => {
    const { slug, editionId, item } = await published(a.id)
    await like(fan, editionId, item).expect(204)

    const res = await request(app.getHttpServer())
      .get(`/public/tenants/${a.slug}/editions/${slug}/program-items`)
      .expect(200)

    expect(JSON.stringify(res.body)).not.toContain(fan.id)
    expect(JSON.stringify(res.body)).not.toContain(fan.email)
  })
})

describe('the personal schedule', () => {
  it('lists the liked items of every tenant by start time, with where they are', async () => {
    const reader = await member()
    const inA = await published(a.id)
    const [inB] = await Promise.all([published(b.id)])
    const earlierInB = await addProgramItem(b.id, inB.editionId, {
      title: 'Earlier',
      startsAt: '2027-06-01 07:00Z',
      endsAt: '2027-06-01 08:00Z',
    })
    await like(reader, inA.editionId, inA.item).expect(204)
    await like(reader, inB.editionId, earlierInB, b.slug).expect(204)

    const res = await schedule(reader).expect(200)

    expect(res.body).toEqual([
      {
        id: earlierInB,
        title: 'Earlier',
        startsAt: '2027-06-01T07:00:00.000Z',
        endsAt: '2027-06-01T08:00:00.000Z',
        edition: { slug: inB.slug, name: inB.slug },
        tenant: {
          slug: b.slug,
          name: `Tenant ${b.slug}`,
          timezone: expect.any(String) as string,
        },
      },
      {
        id: inA.item,
        title: 'Item',
        startsAt: '2027-06-01T09:00:00.000Z',
        endsAt: '2027-06-01T10:00:00.000Z',
        edition: { slug: inA.slug, name: inA.slug },
        tenant: {
          slug: a.slug,
          name: `Tenant ${a.slug}`,
          timezone: expect.any(String) as string,
        },
      },
    ])
  })

  it('shows an account only its own likes', async () => {
    const [mine, theirs] = await Promise.all([member(), member()])
    const { editionId, item } = await published(a.id)
    await like(theirs, editionId, item).expect(204)

    expect((await schedule(mine).expect(200)).body).toEqual([])
  })

  it('leaves out an item once its edition is no longer published', async () => {
    const reader = await member()
    const t = await tenantWithHead()
    const { editionId, item } = await published(t.id)
    await like(reader, editionId, item, t.slug).expect(204)

    await request(app.getHttpServer())
      .patch(`/editions/${editionId}`)
      .use(session(t.head.token))
      .set('X-Tenant-Slug', t.slug)
      .send({ isPublished: false })
      .expect(200)

    expect((await schedule(reader).expect(200)).body).toEqual([])
  })

  it('refuses a request without a token', async () => {
    await request(app.getHttpServer()).get('/me/schedule').expect(401)
  })
})
