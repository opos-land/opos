import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { MAX_ADD_ONS, MAX_CUSTOM_FIELDS } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import {
  addAddOn,
  addCustomField,
  addEdition,
  closeTenantDb,
  deleteCreatedTenants,
  type Member,
  storedRows,
  tenantWithHead,
} from './tenants'

// What an edition sells and on what terms (docs/specs/0003-catalog.md): its add-ons, its custom
// fields and the settings of its whole catalog, behind the tickets permission of the edition.
// Which permission each route needs is checked in route-requirements.test.ts; these cover what
// the routes do.

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

/** A row of a list of the catalog, as far as these tests read it. */
interface Listed {
  id: string
  name?: string
  label?: string
  position: number
  hidden: boolean
}

const row = (res: { body: unknown }) => res.body as Listed
const rows = (res: { body: unknown }) => res.body as Listed[]
const names = (res: { body: unknown }) => rows(res).map((listed) => listed.name ?? listed.label)

describe('the add-ons of an edition', () => {
  const room = { name: 'Sleeping room', amountMinor: 0, kind: 'headcount' }

  it('adds an add-on of each kind, each at the end of the list', async () => {
    const c = await convention()

    const free = await c.as('post', '/add-ons', room).expect(201)
    const limited = await c
      .as('post', '/add-ons', {
        name: ' Workshop ',
        description: 'Two hours with the author.',
        amountMinor: 4000,
        kind: 'limited',
        capacity: 30,
        placesLeftThreshold: 5,
      })
      .expect(201)
    await c.as('post', '/add-ons', { name: 'Parking', amountMinor: 1500, kind: 'unlimited' })

    expect(free.body).toEqual({
      id: expect.any(String) as string,
      editionId: c.edition,
      name: 'Sleeping room',
      description: '',
      amountMinor: 0,
      kind: 'headcount',
      capacity: null,
      placesLeftThreshold: null,
      position: 1,
      hidden: false,
    })
    expect(limited.body).toMatchObject({
      name: 'Workshop',
      description: 'Two hours with the author.',
      amountMinor: 4000,
      kind: 'limited',
      capacity: 30,
      placesLeftThreshold: 5,
      position: 2,
    })
    const list = await c.as('get', '/add-ons').expect(200)
    expect(names(list)).toEqual(['Sleeping room', 'Workshop', 'Parking'])
  })

  it.each([
    ['a limited one without a capacity', { kind: 'limited' }],
    ['an unlimited one with a capacity', { kind: 'unlimited', capacity: 10 }],
    ['a headcount with a capacity', { capacity: 10 }],
    ['a threshold on one that is not limited', { placesLeftThreshold: 5 }],
    ['a threshold below one', { kind: 'limited', capacity: 10, placesLeftThreshold: 0 }],
    ['a capacity below zero', { kind: 'limited', capacity: -1 }],
    ['a price below zero', { amountMinor: -1 }],
    ['a price that is no whole number', { amountMinor: 10.5 }],
    ['a blank name', { name: ' ' }],
    ['a kind OPOS does not know', { kind: 'waitlist' }],
    ['a place of its own choosing', { position: 1 }],
  ])('refuses %s, and adds nothing', async (_, values) => {
    const c = await convention()

    const res = await c.as('post', '/add-ons', { ...room, ...values }).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid' })
    expect(await storedRows('add_ons', c.t.id)).toEqual([])
  })

  it('changes what an add-on is called, what it costs and what limits it', async () => {
    const c = await convention()
    const id = await addAddOn(c.t.id, c.edition, { kind: 'limited', capacity: 10 })

    const priced = await c.as('patch', `/add-ons/${id}`, { name: 'Bed', amountMinor: 9900 })
    expect(priced.body).toMatchObject({ name: 'Bed', amountMinor: 9900, capacity: 10 })

    // A kind that is not limited holds no capacity and no threshold: both go with the change.
    const open = await c.as('patch', `/add-ons/${id}`, { kind: 'unlimited' }).expect(200)
    expect(open.body).toMatchObject({
      kind: 'unlimited',
      capacity: null,
      placesLeftThreshold: null,
    })

    const limited = await c
      .as('patch', `/add-ons/${id}`, { kind: 'limited', capacity: 5, placesLeftThreshold: 2 })
      .expect(200)
    expect(limited.body).toMatchObject({ kind: 'limited', capacity: 5, placesLeftThreshold: 2 })
  })

  it('refuses a change that leaves a limited add-on without a capacity', async () => {
    const c = await convention()
    const id = await addAddOn(c.t.id, c.edition)

    for (const body of [{ kind: 'limited' }, { capacity: 3 }, { placesLeftThreshold: 3 }]) {
      const res = await c.as('patch', `/add-ons/${id}`, body).expect(400)
      expect(res.body).toMatchObject({ code: 'request.invalid' })
    }
    expect(await storedRows('add_ons', c.t.id)).toMatchObject([
      { kind: 'unlimited', capacity: null },
    ])
  })

  it('moves an add-on to a place of the list, the others making room', async () => {
    const c = await convention()
    const ids: string[] = []
    for (const name of ['One', 'Two', 'Three'])
      ids.push(await addAddOn(c.t.id, c.edition, { name }))

    const moved = await c.as('patch', `/add-ons/${ids[2]}`, { position: 1 }).expect(200)

    expect(moved.body).toMatchObject({ position: 1 })
    expect(names(await c.as('get', '/add-ons'))).toEqual(['Three', 'One', 'Two'])
    await c.as('patch', `/add-ons/${ids[2]}`, { position: 99 }).expect(200)
    expect(names(await c.as('get', '/add-ons'))).toEqual(['One', 'Two', 'Three'])
  })

  it('hides an add-on and shows it again, keeping it in the list', async () => {
    const c = await convention()
    const id = await addAddOn(c.t.id, c.edition)

    expect(row(await c.as('patch', `/add-ons/${id}`, { hidden: true })).hidden).toBe(true)
    expect((await c.as('get', '/add-ons')).body).toMatchObject([{ id, hidden: true }])
    expect(row(await c.as('patch', `/add-ons/${id}`, { hidden: false })).hidden).toBe(false)
  })

  it('deletes an add-on, and the rest close ranks', async () => {
    const c = await convention()
    const ids: string[] = []
    for (const name of ['One', 'Two', 'Three'])
      ids.push(await addAddOn(c.t.id, c.edition, { name }))

    await c.as('delete', `/add-ons/${ids[0]}`).expect(204)

    const list = await c.as('get', '/add-ons')
    expect(rows(list).map((listed) => [listed.name, listed.position])).toEqual([
      ['Two', 1],
      ['Three', 2],
    ])
  })

  it('answers an add-on of another edition or another convention as unknown', async () => {
    const c = await convention()
    const elsewhere = await addAddOn(c.t.id, await addEdition(c.t.id))
    const theirs = await addAddOn(b.id, editionB)

    for (const id of [elsewhere, theirs, randomUUID(), 'no-uuid']) {
      await c.as('patch', `/add-ons/${id}`, { name: 'Mine now' }).expect(404)
      await c.as('delete', `/add-ons/${id}`).expect(404)
    }
    expect(await storedRows('add_ons', b.id)).toMatchObject([{ name: 'Add-on' }])
  })

  it('holds as many add-ons as an edition may, and no more', async () => {
    const c = await convention()
    for (let n = 0; n < MAX_ADD_ONS; n += 1) await addAddOn(c.t.id, c.edition)

    const res = await c.as('post', '/add-ons', room).expect(409)

    expect(res.body).toMatchObject({
      code: 'catalog.limit-reached',
      params: { limit: MAX_ADD_ONS },
    })
  })
})

describe('the custom fields of an edition', () => {
  it('adds a field at the end of the list, required or not', async () => {
    const c = await convention()

    const first = await c.as('post', '/custom-fields', { label: ' Fandom ', isRequired: false })
    await c.as('post', '/custom-fields', { label: 'City', isRequired: true }).expect(201)

    expect(first.status).toBe(201)
    expect(first.body).toEqual({
      id: expect.any(String) as string,
      editionId: c.edition,
      label: 'Fandom',
      isRequired: false,
      position: 1,
      hidden: false,
    })
    expect(names(await c.as('get', '/custom-fields'))).toEqual(['Fandom', 'City'])
  })

  it.each([
    ['a blank label', { label: ' ', isRequired: true }],
    ['a label over 100 characters', { label: 'l'.repeat(101), isRequired: true }],
    ['no word on whether it is required', { label: 'Fandom' }],
    ['a kind of answer of its own', { label: 'Fandom', isRequired: true, type: 'number' }],
  ])('refuses %s', async (_, body) => {
    const c = await convention()

    await c.as('post', '/custom-fields', body).expect(400)
  })

  it('changes, moves, hides and deletes a field', async () => {
    const c = await convention()
    const fandom = await addCustomField(c.t.id, c.edition, { label: 'Fandom' })
    const city = await addCustomField(c.t.id, c.edition, { label: 'City' })

    const changed = await c
      .as('patch', `/custom-fields/${city}`, { label: 'Town', isRequired: true, position: 1 })
      .expect(200)
    expect(changed.body).toMatchObject({ label: 'Town', isRequired: true, position: 1 })
    expect(names(await c.as('get', '/custom-fields'))).toEqual(['Town', 'Fandom'])

    expect(row(await c.as('patch', `/custom-fields/${city}`, { hidden: true })).hidden).toBe(true)

    await c.as('delete', `/custom-fields/${city}`).expect(204)
    expect((await c.as('get', '/custom-fields')).body).toMatchObject([{ id: fandom, position: 1 }])
  })

  it('answers a field of another edition or another convention as unknown', async () => {
    const c = await convention()
    const theirs = await addCustomField(b.id, editionB)
    const elsewhere = await addCustomField(c.t.id, await addEdition(c.t.id))

    for (const id of [theirs, elsewhere, randomUUID()]) {
      await c.as('patch', `/custom-fields/${id}`, { label: 'Mine now' }).expect(404)
      await c.as('delete', `/custom-fields/${id}`).expect(404)
    }
  })

  it('holds as many fields as an edition may, and no more', async () => {
    const c = await convention()
    for (let n = 0; n < MAX_CUSTOM_FIELDS; n += 1) await addCustomField(c.t.id, c.edition)

    const res = await c.as('post', '/custom-fields', { label: 'One more', isRequired: false })

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      code: 'catalog.limit-reached',
      params: { limit: MAX_CUSTOM_FIELDS },
    })
  })
})

describe("the settings of an edition's catalog", () => {
  const unset = {
    ageBands: null,
    guardianConsentFormUrl: null,
    merchPreorderDeadline: null,
    merchOnlyEnabled: false,
    salesClosedMessage: null,
  }

  it('start with nothing set and merch-only orders off', async () => {
    const c = await convention()

    expect((await c.as('get', '/shop').expect(200)).body).toMatchObject(unset)
  })

  it('set the ages that divide the bands, the consent form, the deadline and the message', async () => {
    const c = await convention()
    const set = {
      ageBands: { teenFromAge: 13, adultFromAge: 18 },
      guardianConsentFormUrl: 'https://convention.test/consent.pdf',
      merchPreorderDeadline: '2027-05-01T21:59:59.000Z',
      merchOnlyEnabled: true,
      salesClosedMessage: 'Tickets return in spring.',
    }

    const res = await c.as('patch', '/shop', set).expect(200)

    expect(res.body).toMatchObject(set)
    expect((await c.as('get', '/shop')).body).toMatchObject(set)
  })

  it('change one setting and leave the others, and clear what was set', async () => {
    const c = await convention()
    await c.as('patch', '/shop', {
      ageBands: { teenFromAge: 13, adultFromAge: 18 },
      faqUrl: 'https://convention.test/faq',
      merchOnlyEnabled: true,
    })

    const changed = await c.as('patch', '/shop', { salesClosedMessage: ' See you soon. ' })
    expect(changed.body).toMatchObject({
      ageBands: { teenFromAge: 13, adultFromAge: 18 },
      faqUrl: 'https://convention.test/faq',
      merchOnlyEnabled: true,
      salesClosedMessage: 'See you soon.',
    })

    const cleared = await c.as('patch', '/shop', {
      ageBands: null,
      salesClosedMessage: null,
      merchOnlyEnabled: false,
    })
    expect(cleared.body).toMatchObject({ ...unset, faqUrl: 'https://convention.test/faq' })
  })

  it.each([
    ['an adult no older than a teen', { ageBands: { teenFromAge: 16, adultFromAge: 16 } }],
    ['one age without the other', { ageBands: { teenFromAge: 13 } }],
    ['a teen from birth', { ageBands: { teenFromAge: 0, adultFromAge: 18 } }],
    ['an age that is no whole number', { ageBands: { teenFromAge: 12.5, adultFromAge: 18 } }],
    ['a consent form that is no link', { guardianConsentFormUrl: 'consent.pdf' }],
    ['a consent form a browser would run', { guardianConsentFormUrl: 'javascript:alert(1)' }],
    ['a deadline that is no moment', { merchPreorderDeadline: 'in May' }],
    ['a blank message', { salesClosedMessage: ' ' }],
    ['a message over 1000 characters', { salesClosedMessage: 'm'.repeat(1001) }],
    ['merch-only orders set to a word', { merchOnlyEnabled: 'yes' }],
  ])('refuse %s', async (_, body) => {
    const c = await convention()

    const res = await c.as('patch', '/shop', body).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid' })
    expect(await storedRows('edition_shops', c.t.id)).toEqual([])
  })
})
