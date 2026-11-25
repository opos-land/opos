import { type NestExpressApplication } from '@nestjs/platform-express'
import { type MerchandiseItem } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { providerAccountLockKey } from '../src/modules/shop/provider-account-lock'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import {
  addAddOn,
  addConsent,
  addCustomField,
  addDiscountCode,
  addEdition,
  addMerchandiseItem,
  addOrder,
  addTicketType,
  closeTenantDb,
  deleteCreatedTenants,
  makeShopReady,
  type Member,
  openTransaction,
  setColumn,
  sleep,
  storedRows,
  tenantWithHead,
} from './tenants'

// A catalog with orders (docs/specs/0003-catalog.md, L1-L4): what an order holds is hidden and
// never deleted, and a capacity or a stock is never set below what orders hold of it. With them,
// what else an order keeps in place: a consent it accepted, its edition, and the credentials its
// payment started with.

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

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

const inUse = { code: 'catalog.in-use' }

type Placing = Awaited<ReturnType<typeof openTransaction>>['sql']

/**
 * An order in the middle of being placed: a transaction that takes the locks placing takes, lets
 * the request start and wait for them, then writes its order and commits. Answers what the
 * request answered once it could go on.
 */
async function whilePlacing(
  locks: (sql: Placing) => Promise<unknown>,
  send: () => PromiseLike<request.Response>,
  writes: (sql: Placing) => Promise<unknown>,
) {
  const placing = await openTransaction()
  try {
    await locks(placing.sql)
    let answered = false
    const answer = Promise.resolve(send()).then((res) => ((answered = true), res))
    await sleep(300)
    expect(answered).toBe(false)
    await writes(placing.sql)
    await placing.commit()
    return await answer
  } catch (error) {
    await placing.rollback().catch(() => undefined)
    throw error
  }
}

describe('what an order holds', () => {
  it('is hidden and never deleted: a ticket type, an add-on and a custom field', async () => {
    const c = await convention()
    const standard = await addTicketType(c.t.id, c.edition)
    const room = await addAddOn(c.t.id, c.edition)
    const city = await addCustomField(c.t.id, c.edition)
    const order = await addOrder(c.t.id, c.edition, { ticketTypeId: standard, addOnIds: [room] })
    await openTransaction().then(async ({ sql, commit }) => {
      await sql`
        insert into order_custom_field_answers (tenant_id, edition_id, order_id, custom_field_id, answer)
        values (${c.t.id}, ${c.edition}, ${order.id}, ${city}, 'Poznań')
      `
      await commit()
    })

    for (const path of [
      `/ticket-types/${standard}`,
      `/add-ons/${room}`,
      `/custom-fields/${city}`,
    ]) {
      const res = await c.as('delete', path).expect(409)
      expect(res.body).toMatchObject(inUse)
      // Hiding takes it out of the shop and leaves it on its order.
      expect((await c.as('patch', path, { hidden: true }).expect(200)).body).toMatchObject({
        hidden: true,
      })
    }
    for (const table of ['ticket_types', 'add_ons', 'edition_custom_fields']) {
      expect(await storedRows(table, c.t.id)).toHaveLength(1)
    }
  })

  it('counts also once it holds nothing: an expired order keeps what it named', async () => {
    const c = await convention()
    const standard = await addTicketType(c.t.id, c.edition)
    await addOrder(c.t.id, c.edition, { ticketTypeId: standard, status: 'expired', holds: false })

    expect((await c.as('delete', `/ticket-types/${standard}`).expect(409)).body).toMatchObject(
      inUse,
    )
  })

  it('is a merchandise item and its variant, whatever would take the variant away', async () => {
    const c = await convention()
    const made = (
      await c.as('post', '/merchandise-items', {
        name: 'T-shirt',
        amountMinor: 8000,
        perOrderLimit: 5,
        axes: [{ name: 'Size', values: [{ label: 'S' }, { label: 'M' }] }],
      })
    ).body as MerchandiseItem
    const [small, medium] = made.axes[0]!.values
    const withVariants = (
      await c.as('put', `/merchandise-items/${made.id}/variants`, {
        variants: [{ valueIds: [small!.id] }, { valueIds: [medium!.id] }],
      })
    ).body as MerchandiseItem
    const held = withVariants.variants.find((variant) => variant.valueIds[0] === small!.id)!
    await addOrder(c.t.id, c.edition, {
      variants: [{ itemId: made.id, variantId: held.id, quantity: 1 }],
    })
    const size = { id: made.axes[0]!.id, name: 'Size' }
    const keep = { id: small!.id, label: 'S' }

    for (const [method, path, body] of [
      ['delete', `/merchandise-items/${made.id}`, undefined],
      // Leaving the variant out of the list.
      ['put', `/merchandise-items/${made.id}/variants`, { variants: [{ valueIds: [medium!.id] }] }],
      // Taking its value away, and adding an axis, which leaves no variant standing.
      [
        'patch',
        `/merchandise-items/${made.id}`,
        { axes: [{ ...size, values: [{ id: medium!.id, label: 'M' }] }] },
      ],
      [
        'patch',
        `/merchandise-items/${made.id}`,
        {
          axes: [
            { ...size, values: [keep, { id: medium!.id, label: 'M' }] },
            { name: 'Cut', values: [{ label: 'Fitted' }] },
          ],
        },
      ],
    ] as const) {
      const res = await c.as(method, path, body).expect(409)
      expect(res.body).toMatchObject(inUse)
    }
    expect(await storedRows('merchandise_variants', c.t.id)).toHaveLength(2)

    // The variant no order holds goes; the held one is hidden instead.
    const left = (
      await c
        .as('put', `/merchandise-items/${made.id}/variants`, {
          variants: [{ valueIds: [small!.id], hidden: true }],
        })
        .expect(200)
    ).body as MerchandiseItem
    expect(left.variants).toMatchObject([{ id: held.id, hidden: true }])
  })

  it('leaves a row no order holds to be deleted', async () => {
    const c = await convention()
    const standard = await addTicketType(c.t.id, c.edition)
    const other = await addTicketType(c.t.id, c.edition, { name: 'Other' })
    await addOrder(c.t.id, c.edition, { ticketTypeId: other })

    await c.as('delete', `/ticket-types/${standard}`).expect(204)
  })
})

describe('a capacity and a stock', () => {
  const belowHeld = (held: number) => ({ code: 'catalog.below-held', params: { held } })

  it('are never set below what orders hold', async () => {
    const c = await convention()
    const standard = await addTicketType(c.t.id, c.edition, { capacity: 10 })
    const workshop = await addAddOn(c.t.id, c.edition, { kind: 'limited', capacity: 10 })
    const pin = await addMerchandiseItem(c.t.id, c.edition, { stock: 10 })
    for (let n = 0; n < 2; n += 1) {
      await addOrder(c.t.id, c.edition, {
        ticketTypeId: standard,
        addOnIds: [workshop],
        variants: [{ itemId: pin.id, variantId: pin.variantId, quantity: 2 }],
      })
    }
    // An order that holds nothing no longer counts.
    await addOrder(c.t.id, c.edition, { ticketTypeId: standard, status: 'expired', holds: false })
    const stock = `/merchandise-items/${pin.id}/variants/${pin.variantId}/stock`

    expect((await c.as('patch', `/ticket-types/${standard}`, { capacity: 1 })).body).toMatchObject(
      belowHeld(2),
    )
    expect((await c.as('patch', `/add-ons/${workshop}`, { capacity: 1 })).body).toMatchObject(
      belowHeld(2),
    )
    expect((await c.as('put', stock, { stock: 3 })).body).toMatchObject(belowHeld(4))
    expect((await c.as('put', stock, { stock: 3 })).status).toBe(409)

    // Down to what is held, and no limit at all, are both fine.
    await c.as('patch', `/ticket-types/${standard}`, { capacity: 2 }).expect(200)
    await c.as('patch', `/ticket-types/${standard}`, { capacity: null }).expect(200)
    await c.as('patch', `/add-ons/${workshop}`, { capacity: 2 }).expect(200)
    await c.as('put', stock, { stock: 4 }).expect(200)
    await c.as('put', stock, { stock: null }).expect(200)
  })

  it('wait for an order being placed, and count it', async () => {
    const c = await convention()
    const standard = await addTicketType(c.t.id, c.edition, { capacity: 5 })
    await addOrder(c.t.id, c.edition, { ticketTypeId: standard })
    // An order in the middle of being placed: it holds the lock of the ticket type's row, as
    // placing does before it counts.
    const change = await whilePlacing(
      (sql) => sql`select id from ticket_types where id = ${standard} for update`,
      () => c.as('patch', `/ticket-types/${standard}`, { capacity: 1 }),
      async (sql) => {
        await sql`
          insert into orders (tenant_id, edition_id, number, status, email, holder_name, age_band,
            total_minor, holds, hold_ends_at, result_token_hash)
          values (${c.t.id}, ${c.edition}, 'WAXTXNGXXX', 'awaiting-payment', 'b@example.test',
            'Ada', 'adult', 0, true, '2099-01-01T00:00:00Z', repeat('0', 64))
        `
        await sql`
          insert into order_lines (tenant_id, edition_id, order_id, kind, ticket_type_id,
            quantity, unit_amount_minor, amount_minor)
          select tenant_id, edition_id, id, 'ticket', ${standard}, 1, 0, 0 from orders
          where number = 'WAXTXNGXXX' and tenant_id = ${c.t.id}
        `
      },
    )

    expect(change.status).toBe(409)
    expect(change.body).toMatchObject(belowHeld(2))
  })
})

// An order locks the add-ons of its cart by identifier (docs/ARCHITECTURE.md, invariant 9). A
// change that touches several add-ons takes them the same way, so neither waits for the other
// while it holds a row the other needs.
describe('a change of several add-ons at once', () => {
  it.each([
    ['a new place with a new capacity', 'patch', 200],
    ['a deletion, after which the rest close ranks', 'delete', 204],
  ] as const)('takes them as an order being placed does: %s', async (_, method, status) => {
    const c = await convention()
    const limited = { kind: 'limited', capacity: 10 } as const
    const [first, second] = [
      await addAddOn(c.t.id, c.edition, limited),
      await addAddOn(c.t.id, c.edition, limited),
    ].sort() as [string, string]
    // The one an order locks second stands first in the list: moved or deleted, it moves the
    // other.
    await setColumn('add_ons', second, 'position', 1)
    await setColumn('add_ons', first, 'position', 2)

    const res = await whilePlacing(
      // An order being placed with both holds the first, and has not reached the second.
      (sql) => sql`select id from add_ons where id = ${first} for update`,
      () =>
        c.as(
          method,
          `/add-ons/${second}`,
          method === 'patch' ? { capacity: 5, position: 2 } : undefined,
        ),
      // It takes the second without waiting: the change holds neither of the two yet.
      (sql) => sql`select id from add_ons where id = ${second} for update nowait`,
    )

    expect(res.status).toBe(status)
    const left = (await storedRows('add_ons', c.t.id)).map((row) => [row.id, row.position])
    expect(left).toEqual(
      method === 'patch'
        ? expect.arrayContaining([
            [first, 1],
            [second, 2],
          ])
        : [[first, 1]],
    )
  })
})

// An order takes its locks in one order: the ticket type, the add-ons, the variants, and the
// discount code last (docs/ARCHITECTURE.md, invariant 9). A change that needs a row an order
// locks and a row an order asks for later waits for the first while it holds nothing of the
// second: the two never wait for each other.
describe('a change that needs two of the rows an order takes', () => {
  it('holds a discount code only once the ticket types and add-ons it names are free', async () => {
    const c = await convention()
    const standard = await addTicketType(c.t.id, c.edition)
    const room = await addAddOn(c.t.id, c.edition)
    const applies = { ticketTypeIds: [standard], addOnIds: [room] }
    const code = await addDiscountCode(c.t.id, c.edition, { usageLimit: 1, ...applies })
    const change = { usageLimit: 5, ...applies, itemIds: [] }

    for (const table of ['ticket_types', 'add_ons'] as const) {
      const res = await whilePlacing(
        // An order being placed with the code holds what it buys, and has not reached the code.
        (sql) => sql`
          select id from ${sql(table)} where id in (${standard}, ${room}) for update
        `,
        () => c.as('patch', `/discount-codes/${code.id}`, change),
        // It takes the code, its last lock, without waiting: the change does not hold it yet.
        (sql) => sql`select id from discount_codes where id = ${code.id} for update nowait`,
      )

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject(change)
    }
  })

  it('deletes a merchandise item only once its variants are free', async () => {
    const c = await convention()
    const pin = await addMerchandiseItem(c.t.id, c.edition, { stock: 5 })

    const res = await whilePlacing(
      // An order being placed with the variant holds it, and has not written its line.
      (sql) => sql`select id from merchandise_variants where id = ${pin.variantId} for update`,
      () => c.as('delete', `/merchandise-items/${pin.id}`),
      // The line names the item, which it finds free: the deletion does not hold it yet.
      async (sql) => {
        await sql`select id from merchandise_items where id = ${pin.id} for key share nowait`
        await sql`
          insert into orders (tenant_id, edition_id, number, status, email, holder_name,
            total_minor, holds, hold_ends_at, result_token_hash)
          values (${c.t.id}, ${c.edition}, 'MEANWH3333', 'awaiting-payment', 'b@example.test',
            'Ada', 5000, true, '2099-01-01T00:00:00Z', repeat('0', 64))
        `
        await sql`
          insert into order_lines (tenant_id, edition_id, order_id, kind, merchandise_item_id,
            merchandise_variant_id, quantity, unit_amount_minor, amount_minor)
          select tenant_id, edition_id, id, 'merchandise', ${pin.id}, ${pin.variantId}, 1, 5000,
            5000
          from orders where number = 'MEANWH3333' and tenant_id = ${c.t.id}
        `
      },
    )

    // The order was placed first: what it holds is never deleted.
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject(inUse)
    expect(await storedRows('merchandise_items', c.t.id)).toHaveLength(1)
  })
})

describe('what else an order keeps in place', () => {
  it('keeps the consent it accepted: it is hidden, never deleted', async () => {
    const c = await convention()
    const terms = await addConsent(c.t.id, c.edition)
    const free = await addConsent(c.t.id, c.edition, { text: 'News', isRequired: false })
    const order = await addOrder(c.t.id, c.edition)
    await openTransaction().then(async ({ sql, commit }) => {
      await sql`
        insert into order_consents (tenant_id, edition_id, order_id, consent_id)
        values (${c.t.id}, ${c.edition}, ${order.id}, ${terms})
      `
      await commit()
    })

    const res = await c.as('delete', `/consents/${terms}`).expect(409)
    expect(res.body).toMatchObject({ code: 'consent.in-use' })
    await c.as('patch', `/consents/${terms}`, { hidden: true }).expect(200)
    await c.as('delete', `/consents/${free}`).expect(204)
  })

  it('keeps its edition: an edition that has an order is not deleted', async () => {
    const c = await convention()
    await addOrder(c.t.id, c.edition)
    const empty = await addEdition(c.t.id)

    const res = await call(c.t.head, 'delete', `/editions/${c.edition}`, undefined, c.t.slug)
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'edition.has-orders' })
    expect(await storedRows('orders', c.t.id)).toHaveLength(1)
    await call(c.t.head, 'delete', `/editions/${empty}`, undefined, c.t.slug).expect(204)
  })

  it('keeps the credentials its payment started with while it awaits payment', async () => {
    const c = await convention()
    await makeShopReady(c.t.id, c.edition)
    const order = await addOrder(c.t.id, c.edition)
    const connect = () =>
      call(
        c.t.head,
        'put',
        '/shop/provider-account',
        { provider: 'fake', credentials: { account: 'another' } },
        c.t.slug,
      )

    const res = await connect()
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'shop.payments-under-way' })
    expect(await storedRows('payment_provider_accounts', c.t.id)).toMatchObject([
      { credentials: 'sealed' },
    ])

    // Once no order of the convention awaits payment, the credentials are given again.
    await openTransaction().then(async ({ sql, commit }) => {
      await sql`update orders set status = 'expired', holds = false where id = ${order.id}`
      await commit()
    })
    expect((await connect()).status).toBe(200)
  })

  it('keeps those credentials from being disconnected while it awaits payment', async () => {
    const c = await convention()
    await makeShopReady(c.t.id, c.edition)
    await addOrder(c.t.id, c.edition)

    const res = await call(c.t.head, 'delete', '/shop/provider-account', undefined, c.t.slug)

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'shop.payments-under-way' })
    expect(await storedRows('payment_provider_accounts', c.t.id)).toHaveLength(1)
  })

  // An order with something to pay shares the lock on the account while it is placed, so a
  // change of the credentials at that moment waits, counts the order and is refused.
  it('makes a change of the credentials wait for an order being placed', async () => {
    const c = await convention()
    await makeShopReady(c.t.id, c.edition)
    const change = await whilePlacing(
      (sql) => sql`select pg_advisory_xact_lock_shared(${providerAccountLockKey(c.t.id)}::bigint)`,
      () =>
        call(
          c.t.head,
          'put',
          '/shop/provider-account',
          { provider: 'fake', credentials: { account: 'another' } },
          c.t.slug,
        ),
      (sql) => sql`
        insert into orders (tenant_id, edition_id, number, status, email, holder_name, age_band,
          total_minor, holds, hold_ends_at, result_token_hash)
        values (${c.t.id}, ${c.edition}, 'WAXTXNGXXX', 'awaiting-payment', 'b@example.test',
          'Ada', 'adult', 100, true, '2099-01-01T00:00:00Z', repeat('0', 64))
      `,
    )

    expect(change.status).toBe(409)
    expect(change.body).toMatchObject({ code: 'shop.payments-under-way' })
  })
})
