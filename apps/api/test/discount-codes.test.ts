import { type NestExpressApplication } from '@nestjs/platform-express'
import { type DiscountCode } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import {
  addAddOn,
  addDiscountCode,
  addEdition,
  addMerchandiseItem,
  addOrder,
  addTicketType,
  closeTenantDb,
  deleteCreatedTenants,
  setColumn,
  storedRows,
  tenantWithHead,
} from './tenants'

// The discount codes of an edition as an org sets them (docs/specs/0008-discount-codes.md,
// D1-D6): a value, what the code applies to, a usage limit and a validity window. A code an order
// used is never deleted: the org ends it.

type Method = 'get' | 'post' | 'patch' | 'delete'

let app: NestExpressApplication

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

/** A tenant of its own with an edition and one of each thing a code applies to. */
async function convention() {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id)
  const standard = await addTicketType(t.id, edition, { name: 'Standard' })
  const room = await addAddOn(t.id, edition, { name: 'Room', amountMinor: 2500 })
  const pin = await addMerchandiseItem(t.id, edition, { name: 'Pin', stock: 5 })
  const as = (method: Method, path = '', body?: object) => {
    const agent = request(app.getHttpServer())
    const req = agent[method](`/editions/${edition}/discount-codes${path}`)
      .use(session(t.head.token))
      .set('X-Tenant-Slug', t.slug)
    return body ? req.send(body) : req
  }
  /** A code as the screen sends it: ten percent off the ticket type. */
  const body = (changes: object = {}) => ({
    code: 'EARLY-10',
    kind: 'percent',
    percent: 10,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2099-01-01T00:00:00.000Z',
    ticketTypeIds: [standard],
    ...changes,
  })
  return { t, edition, standard, room, pin, as, body }
}

const code = (res: { body: unknown }) => res.body as DiscountCode
const list = (res: { body: unknown }) => res.body as DiscountCode[]

describe('setting a discount code', () => {
  it('keeps the code in lower case, with its value, what it applies to, its limit and its window', async () => {
    const c = await convention()

    const res = await c
      .as('post', '', c.body({ usageLimit: 20, addOnIds: [c.room], itemIds: [c.pin.id] }))
      .expect(201)

    expect(code(res)).toEqual({
      id: expect.any(String) as string,
      code: 'early-10',
      kind: 'percent',
      percent: 10,
      amountMinor: null,
      usageLimit: 20,
      uses: 0,
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2099-01-01T00:00:00.000Z',
      ended: false,
      ticketTypeIds: [c.standard],
      addOnIds: [c.room],
      itemIds: [c.pin.id],
    })
    expect(list(await c.as('get').expect(200))).toEqual([code(res)])
  })

  it('takes an amount instead of a percent', async () => {
    const c = await convention()

    const res = await c
      .as('post', '', c.body({ kind: 'amount', percent: undefined, amountMinor: 2000 }))
      .expect(201)

    expect(code(res)).toMatchObject({ kind: 'amount', amountMinor: 2000, percent: null })
  })

  it('refuses a code another one of the edition has, in any case', async () => {
    const c = await convention()
    const sibling = await addEdition(c.t.id)
    await addDiscountCode(c.t.id, sibling, { code: 'early-10' })
    await c.as('post', '', c.body()).expect(201)

    const taken = await c.as('post', '', c.body({ code: 'Early-10' })).expect(409)

    expect(taken.body).toMatchObject({ code: 'discount-code.taken' })
  })

  it('applies to the catalog of its own edition alone', async () => {
    const c = await convention()
    const sibling = await addEdition(c.t.id)
    const foreign = await addTicketType(c.t.id, sibling)
    const foreignPin = await addMerchandiseItem(c.t.id, sibling)

    for (const changes of [
      { ticketTypeIds: [foreign] },
      { addOnIds: [c.standard] },
      { itemIds: [foreignPin.id] },
    ]) {
      const res = await c.as('post', '', c.body(changes)).expect(400)
      expect(res.body).toMatchObject({ code: 'request.invalid' })
    }
    expect(await storedRows('discount_codes', c.t.id)).toEqual([])
  })
})

describe('the discount codes of an edition', () => {
  it('are listed with the uses each holds against its limit', async () => {
    const c = await convention()
    const used = await addDiscountCode(c.t.id, c.edition, {
      code: 'bbb-used',
      usageLimit: 3,
      ticketTypeIds: [c.standard],
    })
    await addDiscountCode(c.t.id, c.edition, { code: 'aaa-new', ended: true })
    await addDiscountCode(c.t.id, await addEdition(c.t.id), { code: 'elsewhere' })
    // A use counts while its order holds: an expired order has let go of it.
    for (const [status, holds] of [
      ['paid', true],
      ['awaiting-payment', true],
      ['expired', false],
    ] as const) {
      const order = await addOrder(c.t.id, c.edition, { status, holds })
      await setColumn('orders', order.id, 'discount_code_id', used.id)
    }

    const res = await c.as('get').expect(200)

    expect(list(res).map((held) => [held.code, held.uses, held.usageLimit, held.ended])).toEqual([
      ['aaa-new', 0, null, true],
      ['bbb-used', 2, 3, false],
    ])
  })
})

describe('changing a discount code', () => {
  it('changes its terms and what it applies to, ends it and lets it run again', async () => {
    const c = await convention()
    const made = code(await c.as('post', '', c.body()).expect(201))

    const res = await c
      .as('patch', `/${made.id}`, {
        code: 'LATE-5',
        percent: 5,
        usageLimit: 2,
        ticketTypeIds: [],
        itemIds: [c.pin.id],
        ended: true,
      })
      .expect(200)

    expect(code(res)).toMatchObject({
      code: 'late-5',
      percent: 5,
      usageLimit: 2,
      ticketTypeIds: [],
      itemIds: [c.pin.id],
      ended: true,
    })
    expect(code(await c.as('patch', `/${made.id}`, { ended: false }).expect(200)).ended).toBe(false)
  })

  it('never sets a limit below the uses orders hold', async () => {
    const c = await convention()
    const used = await addDiscountCode(c.t.id, c.edition, { ticketTypeIds: [c.standard] })
    for (let n = 0; n < 2; n += 1) {
      const order = await addOrder(c.t.id, c.edition, { status: 'paid' })
      await setColumn('orders', order.id, 'discount_code_id', used.id)
    }

    const res = await c.as('patch', `/${used.id}`, { usageLimit: 1 }).expect(409)

    expect(res.body).toMatchObject({ code: 'catalog.below-held', params: { held: 2 } })
    await c.as('patch', `/${used.id}`, { usageLimit: 2 }).expect(200)
  })

  it('refuses a code another one has, and a change that leaves its value in two minds', async () => {
    const c = await convention()
    await addDiscountCode(c.t.id, c.edition, { code: 'taken-code' })
    const mine = await addDiscountCode(c.t.id, c.edition, { ticketTypeIds: [c.standard] })

    const taken = await c.as('patch', `/${mine.id}`, { code: 'TAKEN-CODE' }).expect(409)
    expect(taken.body).toMatchObject({ code: 'discount-code.taken' })
    // A percent code is given an amount without becoming an amount code.
    await c.as('patch', `/${mine.id}`, { amountMinor: 500 }).expect(400)
    await c.as('patch', `/${mine.id}`, { kind: 'amount', amountMinor: 500 }).expect(200)
  })
})

describe('deleting a discount code', () => {
  it('deletes one no order used, and never one an order did', async () => {
    const c = await convention()
    const [unused, used] = [
      await addDiscountCode(c.t.id, c.edition),
      await addDiscountCode(c.t.id, c.edition),
    ]
    const order = await addOrder(c.t.id, c.edition, { status: 'expired', holds: false })
    await setColumn('orders', order.id, 'discount_code_id', used.id)

    await c.as('delete', `/${unused.id}`).expect(204)
    const res = await c.as('delete', `/${used.id}`).expect(409)

    expect(res.body).toMatchObject({ code: 'discount-code.in-use' })
    expect((await storedRows('discount_codes', c.t.id)).map((row) => row.id)).toEqual([used.id])
  })

  it('knows the codes of its own edition alone', async () => {
    const c = await convention()
    const other = await convention()
    const elsewhere = await addDiscountCode(c.t.id, await addEdition(c.t.id))
    const foreign = await addDiscountCode(other.t.id, other.edition)

    for (const id of [elsewhere.id, foreign.id, 'no-identifier']) {
      await c.as('delete', `/${id}`).expect(404)
      await c.as('patch', `/${id}`, { usageLimit: 1 }).expect(404)
    }
    expect(await storedRows('discount_codes', other.t.id)).toHaveLength(1)
  })
})
