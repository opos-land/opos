import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { listedEditionSchema } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import {
  addEdition,
  addLogo,
  closeTenantDb,
  deleteCreatedTenants,
  restore,
  setPublished,
  suspend,
  tenantWithHead,
} from './tenants'

// The list of editions on the portal's home page
// (docs/specs/0014-edition-list-and-edition-page.md): the published editions of every convention
// that is not suspended, to anyone. The database is shared with the other tests and the seed, so
// each test looks for its own rows in what the list answers.

type Tenant = Awaited<ReturnType<typeof tenantWithHead>>
type Period = 'coming' | 'past'

interface Row {
  id: string
  slug: string
  name: string
  startsAt: string
  endsAt: string
  venueCity: string | null
  tenant: { slug: string; name: string; timezone: string; logo: object | null }
}

let app: NestExpressApplication
let a: Tenant

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  a = await tenantWithHead()
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

const list = (query: Record<string, string | number>) =>
  request(app.getHttpServer()).get('/public/editions').query(query)

interface Page {
  editions: Row[]
  next: string | null
}

/** One page of a part of the list. */
const page = async (query: Record<string, string | number>) =>
  (await list(query).expect(200)).body as Page

/** Every row of one part of the list, read a page at a time as the home page does. */
async function all(period: Period, limit = 50, token?: string): Promise<Row[]> {
  const rows: Row[] = []
  let after: string | null = null
  do {
    const req = list({ period, limit, ...(after ? { after } : {}) })
    const res = await (token ? req.use(session(token)) : req).expect(200)
    const { editions, next } = res.body as Page
    rows.push(...editions)
    after = next
  } while (after)
  return rows
}

/** The place in a part of the list after a row, as the list itself names it. */
const placeAfter = (moment: string, id: string) => `${Date.parse(moment)}_${id}`

const of = (tenant: Tenant, rows: Row[]) => rows.filter((row) => row.tenant.slug === tenant.slug)

const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString()
const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

/** A published edition of the tenant, with its slug as its name. */
async function published(tenant: Tenant, values: Parameters<typeof addEdition>[1] = {}) {
  const slug = randomUUID().slice(0, 8)
  const id = await addEdition(tenant.id, { slug, isPublished: true, ...values })
  return { id, slug }
}

describe('the list of editions', () => {
  it('answers a row with what the home page shows of it, and nothing else', async () => {
    const t = await tenantWithHead()
    const logo = await addLogo(t.id, 400, 200)
    const startsAt = fromNow(30 * DAY)
    const endsAt = fromNow(32 * DAY)
    const edition = await published(t, { startsAt, endsAt, venueCity: 'Poznań' })

    const [row] = of(t, await all('coming'))

    expect(row).toEqual({
      id: edition.id,
      slug: edition.slug,
      name: edition.slug,
      startsAt,
      endsAt,
      venueCity: 'Poznań',
      tenant: {
        slug: t.slug,
        name: `Tenant ${t.slug}`,
        timezone: 'Europe/Warsaw',
        logo,
      },
    })
    expect(Object.keys(row!).sort()).toEqual(Object.keys(listedEditionSchema.shape).sort())
  })

  it('answers a convention with no logo and an edition with no city as having none', async () => {
    const t = await tenantWithHead()
    await published(t, { startsAt: fromNow(DAY), endsAt: fromNow(2 * DAY) })

    const [row] = of(t, await all('coming'))

    expect(row).toMatchObject({ venueCity: null, tenant: { logo: null } })
  })

  it('leaves out an unpublished edition, lists it once published and drops it once taken back', async () => {
    const t = await tenantWithHead()
    const id = await addEdition(t.id, { startsAt: fromNow(DAY), endsAt: fromNow(2 * DAY) })
    expect(of(t, await all('coming'))).toEqual([])
    expect(of(t, await all('past'))).toEqual([])

    await setPublished(id, true)
    expect(of(t, await all('coming')).map((row) => row.id)).toEqual([id])

    await setPublished(id, false)
    expect(of(t, await all('coming'))).toEqual([])
  })

  it('leaves out the editions of a suspended convention, and lists them again once restored', async () => {
    const t = await tenantWithHead()
    const coming = await published(t, { startsAt: fromNow(DAY), endsAt: fromNow(2 * DAY) })
    const past = await published(t, { startsAt: fromNow(-3 * DAY), endsAt: fromNow(-2 * DAY) })

    await suspend(t.id)
    try {
      expect(of(t, await all('coming'))).toEqual([])
      expect(of(t, await all('past'))).toEqual([])
    } finally {
      await restore(t.id)
    }

    expect(of(t, await all('coming')).map((row) => row.id)).toEqual([coming.id])
    expect(of(t, await all('past')).map((row) => row.id)).toEqual([past.id])
  })

  it('counts an edition under way and one about to end as coming, and one just ended as past', async () => {
    const t = await tenantWithHead()
    const underWay = await published(t, { startsAt: fromNow(-DAY), endsAt: fromNow(DAY) })
    const ending = await published(t, { startsAt: fromNow(-2 * DAY), endsAt: fromNow(MINUTE) })
    const ended = await published(t, { startsAt: fromNow(-3 * DAY), endsAt: fromNow(-MINUTE) })

    const coming = of(t, await all('coming')).map((row) => row.id)
    const past = of(t, await all('past')).map((row) => row.id)

    expect(coming.sort()).toEqual([underWay.id, ending.id].sort())
    expect(past).toEqual([ended.id])
  })

  it('lists the coming editions from the one that starts soonest', async () => {
    const t = await tenantWithHead()
    const third = await published(t, { startsAt: fromNow(30 * DAY), endsAt: fromNow(31 * DAY) })
    const first = await published(t, { startsAt: fromNow(-DAY), endsAt: fromNow(40 * DAY) })
    const second = await published(t, { startsAt: fromNow(10 * DAY), endsAt: fromNow(11 * DAY) })

    const rows = of(t, await all('coming')).map((row) => row.id)

    expect(rows).toEqual([first.id, second.id, third.id])
  })

  it('lists the past editions from the one that ended last', async () => {
    const t = await tenantWithHead()
    const oldest = await published(t, { startsAt: fromNow(-40 * DAY), endsAt: fromNow(-30 * DAY) })
    const latest = await published(t, { startsAt: fromNow(-50 * DAY), endsAt: fromNow(-DAY) })
    const middle = await published(t, { startsAt: fromNow(-20 * DAY), endsAt: fromNow(-10 * DAY) })

    const rows = of(t, await all('past')).map((row) => row.id)

    expect(rows).toEqual([latest.id, middle.id, oldest.id])
  })

  it.each(['coming', 'past'] as const)(
    'continues the %s editions page after page, with no row twice and none missing',
    async (period) => {
      const t = await tenantWithHead()
      /** A day-long edition `days` ahead in the coming part, or as far behind in the past one. */
      const window = (days: number) =>
        period === 'coming'
          ? { startsAt: fromNow(days * DAY), endsAt: fromNow((days + 1) * DAY) }
          : { startsAt: fromNow(-(days + 1) * DAY), endsAt: fromNow(-days * DAY) }
      // Two editions share their moments, so the order falls back to something that never ties.
      const shared = window(5)
      const twins = await Promise.all([published(t, shared), published(t, shared)])
      const others = await Promise.all([10, 20, 30].map((days) => published(t, window(days))))

      // The other tests add and remove rows of their own meanwhile: only this tenant's compare.
      const whole = of(t, await all(period)).map((row) => row.id)
      const paged = of(t, await all(period, 2)).map((row) => row.id)

      expect(paged).toEqual(whole)
      expect(new Set(paged).size).toBe(paged.length)
      expect([...paged].sort()).toEqual([...twins, ...others].map((edition) => edition.id).sort())
    },
  )

  it('answers at most as many rows as asked for, and 20 when not asked', async () => {
    const t = await tenantWithHead()
    await Promise.all(
      Array.from({ length: 21 }, (_, n) =>
        published(t, { startsAt: fromNow((n + 1) * DAY), endsAt: fromNow((n + 2) * DAY) }),
      ),
    )

    expect((await page({ period: 'coming', limit: 3 })).editions).toHaveLength(3)
    expect((await page({ period: 'coming' })).editions).toHaveLength(20)
  })

  it('names the place the next page continues from, and none after a page that came short', async () => {
    const t = await tenantWithHead()
    // Further ahead than any other test's editions, so these two end the coming part.
    const far = (years: number) => ({
      startsAt: fromNow(years * 365 * DAY),
      endsAt: fromNow(years * 365 * DAY + DAY),
    })
    const [first, last] = [await published(t, far(40)), await published(t, far(41))]
    const before = (await all('coming')).filter((row) => row.id !== first.id && row.id !== last.id)
    const lastBefore = before.at(-1)!

    const full = await page({
      period: 'coming',
      limit: 1,
      after: placeAfter(lastBefore.startsAt, lastBefore.id),
    })
    expect(full.editions.map((row) => row.id)).toEqual([first.id])
    expect(full.next).toBe(placeAfter(full.editions[0]!.startsAt, first.id))

    const short = await page({ period: 'coming', limit: 2, after: full.next! })
    expect(short.editions.map((row) => row.id)).toEqual([last.id])
    expect(short.next).toBeNull()
  })

  it('continues from the place it was given when the row it came from is taken back meanwhile', async () => {
    const t = await tenantWithHead()
    const window = (days: number) => ({
      startsAt: fromNow(days * DAY),
      endsAt: fromNow((days + 1) * DAY),
    })
    const [one, two, three] = [
      await published(t, window(3)),
      await published(t, window(6)),
      await published(t, window(9)),
    ]
    const rows = of(t, await all('coming'))
    const second = rows.find((row) => row.id === two.id)!

    await setPublished(two.id, false)
    const rest = of(
      t,
      (await page({ period: 'coming', limit: 50, after: placeAfter(second.startsAt, two.id) }))
        .editions,
    )

    expect(rows.map((row) => row.id)).toEqual([one.id, two.id, three.id])
    expect(rest.map((row) => row.id)).toEqual([three.id])
  })

  // The place is the client's to give back, never looked up: an edition that is not listed
  // answers nothing of itself through it, not even that it is there.
  it.each([
    [
      'an unpublished edition',
      async (t: Tenant) => addEdition(t.id, { startsAt: fromNow(DAY), endsAt: fromNow(2 * DAY) }),
    ],
    [
      'an edition of a suspended convention',
      async (t: Tenant) => {
        const { id } = await published(t, { startsAt: fromNow(DAY), endsAt: fromNow(2 * DAY) })
        await suspend(t.id)
        return id
      },
    ],
  ])('answers the same after %s as after an edition that was never there', async (_, make) => {
    const t = await tenantWithHead()
    const mine = await tenantWithHead()
    await published(mine, { startsAt: fromNow(5 * DAY), endsAt: fromNow(6 * DAY) })
    const hidden = await make(t)
    const moment = fromNow(DAY)

    const [real, unknown] = await Promise.all([
      page({ period: 'coming', limit: 50, after: placeAfter(moment, hidden) }),
      page({ period: 'coming', limit: 50, after: placeAfter(moment, randomUUID()) }),
    ])

    expect(of(mine, real.editions)).toEqual(of(mine, unknown.editions))
    expect(of(mine, real.editions)).toHaveLength(1)
    expect(of(t, real.editions)).toEqual([])
  })

  it.each([
    ['no period', {}],
    ['an unknown period', { period: 'soon' }],
    ['a page of none', { period: 'past', limit: 0 }],
    ['a page of more than 50', { period: 'past', limit: 51 }],
    ['a place the list never named', { period: 'past', after: 'last' }],
    ['an edition alone as the place', { period: 'past', after: randomUUID() }],
    ['a field of its own', { period: 'past', tenant: 'convention-a' }],
  ])('refuses %s', async (_, query) => {
    const res = await list(query)

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'request.invalid' })
  })

  it('answers the same to a visitor and to a signed-in account', async () => {
    await published(a, { startsAt: fromNow(DAY), endsAt: fromNow(2 * DAY) })

    const visitor = of(a, await all('coming'))
    const head = of(a, await all('coming', 50, a.head.token))

    expect(head).toEqual(visitor)
    expect(visitor).toHaveLength(1)
  })
})
