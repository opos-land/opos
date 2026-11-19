import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { MAX_TICKET_TYPES, type TicketType } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import {
  addAddOn,
  addEdition,
  addMerchandiseItem,
  addTicketType,
  closeTenantDb,
  deleteCreatedTenants,
  type Member,
  storedRows,
  tenantWithHead,
} from './tenants'

// The ticket types of an edition (docs/specs/0003-catalog.md): what each is called, when it
// sells, at which price, whom it lets in and what is offered with it, behind the tickets
// permission of the edition. Which permission each route needs is checked in
// route-requirements.test.ts; these cover what the routes do.

type Tenant = Awaited<ReturnType<typeof tenantWithHead>>
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

let app: NestExpressApplication
let b: Tenant
let editionB: string

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  b = await tenantWithHead()
  editionB = await addEdition(b.id)
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

const call = (
  who: Member,
  method: Method,
  path: string,
  body: object | undefined,
  slug: string,
) => {
  const agent = request(app.getHttpServer())
  const req = agent[method](path).use(session(who.token)).set('X-Tenant-Slug', slug)
  return body ? req.send(body) : req
}

/** A tenant of its own with one edition, so that a test changes nothing another reads. */
async function convention() {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id)
  const as = (method: Method, path: string, body?: object) =>
    call(t.head, method, `/editions/${edition}${path}`, body, t.slug)
  return { t, edition, as }
}

const ticketType = (res: { body: unknown }) => res.body as TicketType
const ticketTypes = (res: { body: unknown }) => res.body as TicketType[]

const standard = {
  name: 'Standard',
  saleStartsAt: '2027-01-01T00:00:00.000Z',
  saleEndsAt: '2027-06-01T00:00:00.000Z',
  ageBands: ['teen', 'adult'],
}
const early = {
  amountMinor: 12000,
  startsAt: '2027-01-01T00:00:00.000Z',
  endsAt: '2027-03-01T00:00:00.000Z',
}
const regular = {
  amountMinor: 15000,
  startsAt: '2027-03-01T00:00:00.000Z',
  endsAt: '2027-06-01T00:00:00.000Z',
}

describe('a ticket type', () => {
  it('is added with a name, a sale window and the age bands it allows, at the end of the list', async () => {
    const c = await convention()

    const res = await c.as('post', '/ticket-types', { ...standard, name: ' Standard ' }).expect(201)
    await c.as('post', '/ticket-types', { ...standard, name: 'Supporter' }).expect(201)

    expect(res.body).toEqual({
      id: expect.any(String) as string,
      editionId: c.edition,
      name: 'Standard',
      shortDescription: '',
      longDescription: '',
      capacity: null,
      saleStartsAt: standard.saleStartsAt,
      saleEndsAt: standard.saleEndsAt,
      ageBands: ['teen', 'adult'],
      discountsExcluded: false,
      shownOutsideSaleWindow: false,
      position: 1,
      hidden: false,
      tiers: [],
      supporterPrices: [],
      perks: [],
      addOnIds: [],
      merchandiseItemIds: [],
    })
    expect(ticketTypes(await c.as('get', '/ticket-types')).map((type) => type.name)).toEqual([
      'Standard',
      'Supporter',
    ])
  })

  it('holds its tiers by their start, its supporter prices from the lowest and its perks in order', async () => {
    const c = await convention()
    const [room, parking] = [
      await addAddOn(c.t.id, c.edition, { name: 'Room' }),
      await addAddOn(c.t.id, c.edition, { name: 'Parking' }),
    ]
    const shirt = await addMerchandiseItem(c.t.id, c.edition)

    const res = await c
      .as('post', '/ticket-types', {
        ...standard,
        shortDescription: 'Three days of the convention.',
        longDescription: 'Entry to every programme item.',
        capacity: 800,
        ageBands: ['adult', 'child', 'teen'],
        discountsExcluded: true,
        shownOutsideSaleWindow: true,
        tiers: [regular, early],
        supporterPrices: [30000, 20000],
        perks: ['A pin', ' A badge with your name '],
        addOnIds: [parking, room],
        merchandiseItemIds: [shirt.id],
      })
      .expect(201)

    expect(res.body).toMatchObject({
      capacity: 800,
      // In the order of the bands, whatever order they came in.
      ageBands: ['child', 'teen', 'adult'],
      discountsExcluded: true,
      shownOutsideSaleWindow: true,
      tiers: [early, regular],
      supporterPrices: [20000, 30000],
      perks: ['A pin', 'A badge with your name'],
      // In the order of the add-ons' own list.
      addOnIds: [room, parking],
      merchandiseItemIds: [shirt.id],
    })
    expect(ticketTypes(await c.as('get', '/ticket-types'))).toEqual([res.body])
  })

  it.each([
    ['a blank name', { name: ' ' }],
    ['no age band', { ageBands: [] }],
    ['an age band twice', { ageBands: ['adult', 'adult'] }],
    ['an age band OPOS does not know', { ageBands: ['senior'] }],
    ['a sale window that ends before it starts', { saleEndsAt: standard.saleStartsAt }],
    ['a sale window with no end', { saleEndsAt: undefined }],
    ['a capacity below zero', { capacity: -1 }],
    ['a short description over 300 characters', { shortDescription: 's'.repeat(301) }],
    ['a tier that ends before it starts', { tiers: [{ ...early, endsAt: early.startsAt }] }],
    ['a tier with a price below zero', { tiers: [{ ...early, amountMinor: -1 }] }],
    ['a supporter price of zero', { supporterPrices: [0] }],
    ['a supporter price twice', { supporterPrices: [20000, 20000] }],
    ['a perk with no name', { perks: [' '] }],
    ['an add-on twice', { addOnIds: Array(2).fill('0198c1a0-0000-7000-8000-000000000001') }],
    ['a place of its own choosing', { position: 1 }],
  ])('is not added with %s', async (_, values) => {
    const c = await convention()

    const res = await c.as('post', '/ticket-types', { ...standard, ...values }).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid' })
    expect(await storedRows('ticket_types', c.t.id)).toEqual([])
  })

  it('has one price at a moment: tiers that overlap are refused, tiers that touch are not', async () => {
    const c = await convention()
    const overlapping = [early, { ...regular, startsAt: '2027-02-28T23:59:59.999Z' }]

    const refused = await c.as('post', '/ticket-types', { ...standard, tiers: overlapping })
    expect(refused.status).toBe(422)
    expect(refused.body).toMatchObject({ code: 'ticket-type.tiers-overlap' })
    expect(await storedRows('ticket_types', c.t.id)).toEqual([])

    const made = ticketType(await c.as('post', '/ticket-types', { ...standard, tiers: [early] }))
    const again = await c.as('patch', `/ticket-types/${made.id}`, { tiers: overlapping })
    expect(again.status).toBe(422)
    expect(again.body).toMatchObject({ code: 'ticket-type.tiers-overlap' })
    expect(await storedRows('ticket_type_price_tiers', c.t.id)).toHaveLength(1)

    await c.as('patch', `/ticket-types/${made.id}`, { tiers: [early, regular] }).expect(200)
  })

  it('changes its fields and leaves the lists a change does not name', async () => {
    const c = await convention()
    const made = ticketType(
      await c.as('post', '/ticket-types', {
        ...standard,
        tiers: [early],
        supporterPrices: [20000],
        perks: ['A pin'],
      }),
    )

    const res = await c
      .as('patch', `/ticket-types/${made.id}`, {
        name: 'Regular',
        capacity: 500,
        ageBands: ['adult'],
        saleEndsAt: '2027-07-01T00:00:00.000Z',
        discountsExcluded: true,
      })
      .expect(200)

    expect(res.body).toEqual({
      ...made,
      name: 'Regular',
      capacity: 500,
      ageBands: ['adult'],
      saleEndsAt: '2027-07-01T00:00:00.000Z',
      discountsExcluded: true,
    })
    expect(
      ticketType(await c.as('patch', `/ticket-types/${made.id}`, { capacity: null })).capacity,
    ).toBeNull()
  })

  it('takes each list as a whole: a new one replaces the old, an empty one clears it', async () => {
    const c = await convention()
    const room = await addAddOn(c.t.id, c.edition)
    const made = ticketType(
      await c.as('post', '/ticket-types', {
        ...standard,
        tiers: [early],
        supporterPrices: [20000],
        perks: ['A pin'],
        addOnIds: [room],
      }),
    )

    const replaced = ticketType(
      await c.as('patch', `/ticket-types/${made.id}`, {
        tiers: [regular],
        supporterPrices: [25000, 50000],
        perks: ['A badge', 'A pin'],
      }),
    )
    expect(replaced).toMatchObject({
      tiers: [regular],
      supporterPrices: [25000, 50000],
      perks: ['A badge', 'A pin'],
      addOnIds: [room],
    })

    const cleared = ticketType(
      await c.as('patch', `/ticket-types/${made.id}`, {
        tiers: [],
        supporterPrices: [],
        perks: [],
        addOnIds: [],
      }),
    )
    expect(cleared).toMatchObject({ tiers: [], supporterPrices: [], perks: [], addOnIds: [] })
  })

  it('keeps its sale window in order when a change names one end of it', async () => {
    const c = await convention()
    const made = ticketType(await c.as('post', '/ticket-types', standard))

    for (const body of [
      { saleEndsAt: '2026-12-31T00:00:00.000Z' },
      { saleStartsAt: standard.saleEndsAt },
    ]) {
      const res = await c.as('patch', `/ticket-types/${made.id}`, body).expect(400)
      expect(res.body).toMatchObject({ code: 'request.invalid' })
    }
    expect(ticketType(await c.as('patch', `/ticket-types/${made.id}`, {}))).toEqual(made)
  })

  it('offers add-ons and merchandise of its own edition alone', async () => {
    const c = await convention()
    const elsewhere = await addEdition(c.t.id)
    const made = ticketType(await c.as('post', '/ticket-types', standard))

    for (const body of [
      { addOnIds: [await addAddOn(c.t.id, elsewhere)] },
      { addOnIds: [await addAddOn(b.id, editionB)] },
      { merchandiseItemIds: [(await addMerchandiseItem(c.t.id, elsewhere)).id] },
      { merchandiseItemIds: [(await addMerchandiseItem(b.id, editionB)).id] },
      { addOnIds: [randomUUID()] },
    ]) {
      await c.as('patch', `/ticket-types/${made.id}`, body).expect(404)
      await c.as('post', '/ticket-types', { ...standard, ...body }).expect(404)
    }
    expect(await storedRows('ticket_types', c.t.id)).toHaveLength(1)
  })

  it('no longer offers an add-on or an item that was deleted', async () => {
    const c = await convention()
    const room = await addAddOn(c.t.id, c.edition)
    const shirt = await addMerchandiseItem(c.t.id, c.edition)
    const made = ticketType(
      await c.as('post', '/ticket-types', {
        ...standard,
        addOnIds: [room],
        merchandiseItemIds: [shirt.id],
      }),
    )

    await c.as('delete', `/add-ons/${room}`).expect(204)
    await c.as('delete', `/merchandise-items/${shirt.id}`).expect(204)

    expect(ticketType(await c.as('patch', `/ticket-types/${made.id}`, {}))).toMatchObject({
      addOnIds: [],
      merchandiseItemIds: [],
    })
  })

  it('moves, is hidden and shown, and is deleted with its lists, the rest closing ranks', async () => {
    const c = await convention()
    const first = ticketType(
      await c.as('post', '/ticket-types', { ...standard, tiers: [early], perks: ['A pin'] }),
    )
    const second = ticketType(await c.as('post', '/ticket-types', { ...standard, name: 'Second' }))

    const moved = ticketType(await c.as('patch', `/ticket-types/${second.id}`, { position: 1 }))
    expect(moved.position).toBe(1)
    expect(ticketTypes(await c.as('get', '/ticket-types')).map((type) => type.name)).toEqual([
      'Second',
      'Standard',
    ])
    expect(
      ticketType(await c.as('patch', `/ticket-types/${second.id}`, { hidden: true })).hidden,
    ).toBe(true)
    expect(
      ticketType(await c.as('patch', `/ticket-types/${second.id}`, { hidden: false })).hidden,
    ).toBe(false)

    await c.as('delete', `/ticket-types/${first.id}`).expect(204)

    expect(ticketTypes(await c.as('get', '/ticket-types'))).toMatchObject([
      { id: second.id, position: 1 },
    ])
    for (const table of ['ticket_type_price_tiers', 'ticket_type_perks']) {
      expect(await storedRows(table, c.t.id)).toEqual([])
    }
  })

  it('of another edition or another convention is unknown', async () => {
    const c = await convention()
    const theirs = await addTicketType(b.id, editionB)
    const elsewhere = await addTicketType(c.t.id, await addEdition(c.t.id))

    for (const id of [theirs, elsewhere, randomUUID(), 'no-uuid']) {
      await c.as('patch', `/ticket-types/${id}`, { name: 'Mine now' }).expect(404)
      await c.as('delete', `/ticket-types/${id}`).expect(404)
    }
    expect(await storedRows('ticket_types', b.id)).toMatchObject([{ name: 'Ticket type' }])
  })

  it('is held up to the limit of an edition', async () => {
    const c = await convention()
    for (let n = 0; n < MAX_TICKET_TYPES; n += 1) await addTicketType(c.t.id, c.edition)

    const res = await c.as('post', '/ticket-types', standard).expect(409)

    expect(res.body).toMatchObject({
      code: 'catalog.limit-reached',
      params: { limit: MAX_TICKET_TYPES },
    })
  })
})
