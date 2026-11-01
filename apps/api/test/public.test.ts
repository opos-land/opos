import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { createAccount, deleteCreatedAccounts } from './auth'
import {
  addEdition,
  addLike,
  addProgramItem,
  addSpeaker,
  closeTenantDb,
  deleteCreatedTenants,
  tenantWithHead,
} from './tenants'

// The convention pages' routes (PLAN.md 5.7): no sign-in, and only what a published edition shows.

type Tenant = Awaited<ReturnType<typeof tenantWithHead>>

let app: NestExpressApplication
let a: Tenant
let b: Tenant

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

const get = (path: string) => request(app.getHttpServer()).get(`/public/tenants${path}`)

const fresh = () => tenantWithHead()

/** A published edition of the tenant, with its slug. */
async function published(tenantId: string, values: Parameters<typeof addEdition>[1] = {}) {
  const slug = randomUUID().slice(0, 8)
  const id = await addEdition(tenantId, { slug, isPublished: true, ...values })
  return { id, slug }
}

describe('the convention', () => {
  it('answers its name, language and time zone to anyone, and nothing else', async () => {
    const res = await get(`/${a.slug}`).expect(200)

    expect(res.body).toEqual({
      name: `Tenant ${a.slug}`,
      defaultLocale: expect.any(String) as string,
      timezone: expect.any(String) as string,
    })
  })

  it('answers 404 for an unknown address', async () => {
    const res = await get('/no-such-convention').expect(404)

    expect(res.body).toMatchObject({ code: 'request.not-found' })
  })

  // Postgres refuses a null byte in a parameter, so these must not reach a query.
  it.each(['/%00', '/a%00b', '/a%00b/editions', '/a%00b/active-edition'])(
    'answers 404 for %s, an address no convention can have',
    async (path) => {
      await get(path).expect(404)
    },
  )
})

describe('editions', () => {
  it('lists the published editions, newest first, without the unpublished', async () => {
    const t = await fresh()
    const older = await published(t.id, { startsAt: '2025-06-01', endsAt: '2025-06-03' })
    const newer = await published(t.id, { startsAt: '2027-06-01', endsAt: '2027-06-03' })
    await addEdition(t.id, { slug: 'hidden' })

    const res = await get(`/${t.slug}/editions`).expect(200)

    expect((res.body as { slug: string }[]).map(({ slug }) => slug)).toEqual([
      newer.slug,
      older.slug,
    ])
  })

  it('shows an edition without the fields of the panel', async () => {
    const t = await fresh()
    const { id, slug } = await published(t.id, { isActive: true })

    const res = await get(`/${t.slug}/editions/${slug}`).expect(200)

    expect(res.body).toEqual({
      id,
      slug,
      name: slug,
      startsAt: expect.any(String) as string,
      endsAt: expect.any(String) as string,
      isActive: true,
    })
  })

  it('answers an unpublished edition exactly as an unknown one', async () => {
    const t = await fresh()
    await addEdition(t.id, { slug: 'draft' })

    const draft = await get(`/${t.slug}/editions/draft`).expect(404)
    const unknown = await get(`/${t.slug}/editions/unknown`).expect(404)

    expect(draft.body).toEqual(unknown.body)
  })

  it.each(['a%00b', 'Not_A_Slug'])('answers 404 for %s, which no edition can use', async (slug) => {
    const t = await fresh()

    await get(`/${t.slug}/editions/${slug}`).expect(404)
    await get(`/${t.slug}/editions/${slug}/program-items`).expect(404)
  })

  it('answers the active edition, also one whose address is "active"', async () => {
    const t = await fresh()
    const active = await published(t.id, { isActive: true })
    await addEdition(t.id, { slug: 'active', isPublished: true })

    const current = await get(`/${t.slug}/active-edition`).expect(200)
    expect(current.body).toMatchObject({ slug: active.slug, isActive: true })

    const named = await get(`/${t.slug}/editions/active`).expect(200)
    expect(named.body).toMatchObject({ slug: 'active', isActive: false })
  })

  it('answers 404 when the active edition is unpublished, or when none is active', async () => {
    const hidden = await fresh()
    await addEdition(hidden.id, { isActive: true })
    const draft = await get(`/${hidden.slug}/active-edition`).expect(404)

    const none = await fresh()
    await published(none.id)
    const absent = await get(`/${none.slug}/active-edition`).expect(404)

    expect(draft.body).toEqual(absent.body)
  })

  it('keeps the editions of one convention off the address of another', async () => {
    const t = await fresh()
    const { slug } = await published(t.id)

    await get(`/${b.slug}/editions/${slug}`).expect(404)
    expect((await get(`/${b.slug}/editions`).expect(200)).body).toEqual([])
  })
})

describe('the programme', () => {
  const itemsPath = (tenantSlug: string, editionSlug: string) =>
    `/${tenantSlug}/editions/${editionSlug}/program-items`

  it('lists the items by start time, with speaker names and like counts', async () => {
    const t = await fresh()
    const { id: editionId, slug } = await published(t.id)
    const later = await addProgramItem(t.id, editionId, {
      title: 'Later',
      startsAt: '2027-06-01 12:00Z',
      endsAt: '2027-06-01 13:00Z',
    })
    const earlier = await addProgramItem(t.id, editionId, { title: 'Earlier' })
    const [speaker, fan, other] = await Promise.all([
      createAccount({ first_name: 'Kasia', last_name: 'Mazur' }),
      createAccount(),
      createAccount(),
    ])
    await addSpeaker(t.id, earlier, speaker.id)
    await addLike(t.id, earlier, fan.id)
    await addLike(t.id, earlier, other.id)

    const res = await get(itemsPath(t.slug, slug)).expect(200)

    expect(res.body).toEqual([
      {
        id: earlier,
        title: 'Earlier',
        description: null,
        startsAt: '2027-06-01T09:00:00.000Z',
        endsAt: '2027-06-01T10:00:00.000Z',
        speakers: [{ firstName: 'Kasia', lastName: 'Mazur' }],
        likeCount: 2,
      },
      {
        id: later,
        title: 'Later',
        description: null,
        startsAt: '2027-06-01T12:00:00.000Z',
        endsAt: '2027-06-01T13:00:00.000Z',
        speakers: [],
        likeCount: 0,
      },
    ])
  })

  it('never shows the address or account of a speaker, or who liked an item', async () => {
    const t = await fresh()
    const { id: editionId, slug } = await published(t.id)
    const item = await addProgramItem(t.id, editionId)
    const [speaker, fan] = await Promise.all([
      createAccount({ first_name: 'Kasia', last_name: 'Mazur' }),
      createAccount(),
    ])
    await addSpeaker(t.id, item, speaker.id)
    await addLike(t.id, item, fan.id)

    for (const path of [itemsPath(t.slug, slug), `${itemsPath(t.slug, slug)}/${item}`]) {
      const body = JSON.stringify((await get(path).expect(200)).body)
      for (const secret of [speaker.email, speaker.id, fan.email, fan.id]) {
        expect(body).not.toContain(secret)
      }
    }
  })

  it('leaves out a speaker with no name, who has nothing public to show', async () => {
    const t = await fresh()
    const { id: editionId, slug } = await published(t.id)
    const item = await addProgramItem(t.id, editionId)
    await addSpeaker(t.id, item, (await createAccount()).id)

    const res = await get(`${itemsPath(t.slug, slug)}/${item}`).expect(200)

    expect(res.body).toMatchObject({ speakers: [] })
  })

  it('shows one item with the same counters', async () => {
    const t = await fresh()
    const { id: editionId, slug } = await published(t.id)
    const item = await addProgramItem(t.id, editionId, { title: 'Panel' })
    await addLike(t.id, item, (await createAccount()).id)

    const res = await get(`${itemsPath(t.slug, slug)}/${item}`).expect(200)

    expect(res.body).toMatchObject({ id: item, title: 'Panel', likeCount: 1 })
  })

  it('answers the programme of an unpublished edition exactly as an unknown one', async () => {
    const t = await fresh()
    const editionId = await addEdition(t.id, { slug: 'draft' })
    const item = await addProgramItem(t.id, editionId)

    const list = await get(itemsPath(t.slug, 'draft')).expect(404)
    const unknownList = await get(itemsPath(t.slug, 'unknown')).expect(404)
    expect(list.body).toEqual(unknownList.body)

    const details = await get(`${itemsPath(t.slug, 'draft')}/${item}`).expect(404)
    const unknownDetails = await get(`${itemsPath(t.slug, 'unknown')}/${item}`).expect(404)
    expect(details.body).toEqual(unknownDetails.body)
  })

  it('answers 404 for an item outside the edition or the convention of the address', async () => {
    const t = await fresh()
    const here = await published(t.id)
    const there = await published(t.id)
    const item = await addProgramItem(t.id, there.id)
    const foreign = await published(b.id)
    const foreignItem = await addProgramItem(b.id, foreign.id)

    const outside = await get(`${itemsPath(t.slug, here.slug)}/${item}`).expect(404)
    const unknown = await get(`${itemsPath(t.slug, here.slug)}/${randomUUID()}`).expect(404)
    expect(outside.body).toEqual(unknown.body)
    await get(`${itemsPath(t.slug, here.slug)}/${foreignItem}`).expect(404)
    await get(`${itemsPath(t.slug, here.slug)}/not-a-uuid`).expect(404)
    expect((await get(itemsPath(t.slug, here.slug)).expect(200)).body).toEqual([])
  })
})
