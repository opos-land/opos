import { type NestExpressApplication } from '@nestjs/platform-express'
import {
  type MyOrder,
  type OpenedOrderLink,
  type PlacedOrder,
  type Quote,
  type ScanResult,
  type StartedAttempt,
} from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTE_RATE_LIMITS } from '../src/common/rate-limit/route-rate-limit'
import { STAND_IN_TOKEN } from '../src/modules/checkout/bot-check'
import { type FakeProvider } from '../src/modules/payments/fake-provider'
import { PROVIDER_MODULES } from '../src/modules/payments/payment-providers'
import { loadEnv } from '../src/config/env'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import { type OrderDesk, orderDesk } from './order-desk'
import {
  addAddOn,
  addDiscountCode,
  addEdition,
  addMerchandiseItem,
  addOrderLinkWithToken,
  addScanner,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  type Member,
  offerWith,
  openTransaction,
  setCatalogSettings,
  setColumn,
  setPublished,
  sleep,
  storedRows,
} from './tenants'

// What a signed-in account does with its orders in a convention
// (docs/specs/0009-buyer-self-service.md, U1-U4 and B1-B6): it sees them, has the QR code of a
// paid one sent again, pays one still unpaid and buys more for the same ticket.

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

type Row = Record<string, unknown>

const env = loadEnv()

const fake = () => app.get<Map<string, FakeProvider>>(PROVIDER_MODULES).get('fake')!

/** A route of the convention called as a signed-in account that has no place in its team. */
const as = (d: OrderDesk, who: Member, method: 'get' | 'post', path: string, body?: object) => {
  const agent = request(app.getHttpServer())
  const req = agent[method](path).use(session(who.token)).set('X-Tenant-Slug', d.t.slug)
  return body ? req.send(body) : req
}

/** The account's order in the edition's shop: a ticket, unless the body says otherwise. */
const place = (d: OrderDesk, who: Member, changes: Row = {}) =>
  as(d, who, 'post', `/editions/${d.edition}/shop/orders`, {
    cart: { ticket: { ticketTypeId: d.standard } },
    holderName: 'Ada Lovelace',
    ageBand: 'adult',
    providerConsentAccepted: true,
    expectedTotalMinor: 10000,
    botCheckToken: STAND_IN_TOKEN,
    ...changes,
  })
const placed = async (d: OrderDesk, who: Member, changes: Row = {}) =>
  (await place(d, who, changes).expect(201)).body as PlacedOrder
/** The account's order, placed and paid at the fake provider. */
const bought = async (d: OrderDesk, who: Member, changes: Row = {}) => {
  const order = await placed(d, who, changes)
  await d.pay(order)
  return order
}
const mine = async (d: OrderDesk, who: Member) =>
  (await as(d, who, 'get', '/orders/mine').expect(200)).body as MyOrder[]

/** What "Buy more" sends: no ticket, and the order it adds to. */
const more = (d: OrderDesk, who: Member, to: PlacedOrder, cart: Row, expectedTotalMinor: number) =>
  place(d, who, {
    cart: { ticket: null, ...cart },
    holderName: 'Somebody Else',
    ageBand: null,
    expectedTotalMinor,
    extendsOrderId: to.orderId,
  })

/** The account's quote of a cart in the edition's shop: for "Buy more", with the order added to. */
const quote = (d: OrderDesk, who: Member, body: Row, edition = d.edition) =>
  as(d, who, 'post', `/editions/${edition}/shop/quote`, body)

/** A desk that also sells a workshop at 40.00 and a pin at 50.00 with the ticket type. */
async function deskWithExtras() {
  const d = await orderDesk(app)
  const workshop = await addAddOn(d.t.id, d.edition, { name: 'Workshop', amountMinor: 4000 })
  const room = await addAddOn(d.t.id, d.edition, { name: 'Sleeping room' })
  const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 20 })
  await offerWith(d.t.id, d.edition, d.standard, { addOnIds: [workshop, room], itemIds: [pin.id] })
  return { d, workshop, room, pin }
}

describe("an account's orders in a convention", () => {
  it('are its own alone, of this convention alone, the newest first, with what each holds', async () => {
    const [d, elsewhere] = [await orderDesk(app), await orderDesk(app)]
    const [buyer, other] = [await member(), await member()]
    const first = await bought(d, buyer)
    const second = await placed(d, buyer)
    await placed(d, other)
    await placed(elsewhere, buyer)
    await setColumn('orders', first.orderId, 'placed_at', '2026-01-01T10:00:00Z')

    const orders = await mine(d, buyer)

    expect(orders.map((order) => order.number)).toEqual([second.number, first.number])
    expect(orders[0]).toMatchObject({
      id: second.orderId,
      status: 'awaiting-payment',
      holderName: 'Ada Lovelace',
      edition: { id: d.edition, slug: d.slug },
      lines: [{ kind: 'ticket', name: 'Standard', quantity: 1, amountMinor: 10000 }],
      totalMinor: 10000,
      currency: 'PLN',
      // Within its hold by the shop's own clock: "Pay now" would start a payment attempt.
      payable: true,
      // Nothing is added to an order that is not paid.
      bought: null,
    })
    expect(new Date(orders[0]!.holdEndsAt ?? 0).getTime()).toBeGreaterThan(Date.now())
    expect(orders[1]).toMatchObject({
      status: 'paid',
      holdEndsAt: null,
      payable: false,
      bought: { ticketTypeId: d.standard, addOnIds: [], itemIds: [] },
    })
    expect(JSON.stringify(orders)).not.toContain(buyer.email.toLowerCase())
    expect(await mine(elsewhere, buyer)).toHaveLength(1)
  })

  it('are read with a session alone, and are none for an account that bought nothing', async () => {
    const d = await orderDesk(app)
    await d.paid()

    await request(app.getHttpServer())
      .get('/orders/mine')
      .set('X-Tenant-Slug', d.t.slug)
      .expect(401)
    expect(await mine(d, await member())).toEqual([])
  })

  it('leave out an order of an edition that is not published', async () => {
    const d = await orderDesk(app)
    const buyer = await member()
    await bought(d, buyer)
    await setPublished(d.edition, false)

    expect(await mine(d, buyer)).toEqual([])
  })
})

describe('"Resend QR code"', () => {
  it('sends the confirmation of the account’s own paid order again, and of no other', async () => {
    const d = await orderDesk(app)
    const [buyer, other] = [await member(), await member()]
    const paid = await bought(d, buyer)
    const unpaid = await placed(d, buyer)
    const resend = (who: Member, orderId: string) =>
      as(d, who, 'post', `/orders/mine/${orderId}/resend-confirmation`)

    await resend(buyer, paid.orderId).expect(204)

    expect(await d.emails(paid.orderId)).toEqual([
      ['order-confirmation', buyer.email.toLowerCase()],
      ['order-confirmation', buyer.email.toLowerCase()],
    ])
    const refused = await resend(buyer, unpaid.orderId).expect(409)
    expect(refused.body).toMatchObject({ code: 'order.not-paid' })
    // Another account's order is not there, and neither is one that never was.
    for (const res of [
      await resend(other, paid.orderId),
      await resend(buyer, '0198c1a0-0000-7000-8000-000000000001'),
      await resend(buyer, 'no-order'),
    ]) {
      expect(res.status).toBe(404)
      expect(res.body).toMatchObject({ code: 'request.not-found' })
    }
    expect(await d.emails(paid.orderId)).toHaveLength(2)
    // An edition taken back answers as an unknown address, as the list of orders does.
    await setPublished(d.edition, false)
    await resend(buyer, paid.orderId).expect(404)
    expect(await d.emails(paid.orderId)).toHaveLength(2)
  })

  // A changed email is the one way a ticket passes to another person
  // (docs/specs/0006-order-management.md, C2 and C3): the order stays among those of the account
  // it was on, which has nothing sent to its new holder from then on.
  it('sends nothing of an order an org moved to another address, and the list says so', async () => {
    const d = await orderDesk(app)
    const buyer = await member()
    const paid = await bought(d, buyer)
    const unpaid = await placed(d, buyer)
    const offered = async () =>
      Object.fromEntries((await mine(d, buyer)).map((order) => [order.id, order.resendable]))
    expect(await offered()).toEqual({ [paid.orderId]: true, [unpaid.orderId]: false })
    await d
      .head('put', `/orders/${paid.orderId}/email`, { email: 'new-holder@example.test' })
      .expect(200)
    const queued = await d.emails(paid.orderId)

    // As often as an order's confirmation is sent again in an hour: a refusal spends no try.
    for (let asked = 0; asked < ROUTE_RATE_LIMITS.confirmationResends.limit; asked += 1) {
      const refused = await as(
        d,
        buyer,
        'post',
        `/orders/mine/${paid.orderId}/resend-confirmation`,
      ).expect(409)
      expect(refused.body).toMatchObject({ code: 'order.passed-on' })
    }

    expect(await d.emails(paid.orderId)).toEqual(queued)
    // The order is still the account's to see, with no way to send its QR code.
    expect(await offered()).toEqual({ [paid.orderId]: false, [unpaid.orderId]: false })
    // The org of the edition still sends it to the address the order has now.
    await d.head('post', `/orders/${paid.orderId}/resend-confirmation`).expect(200)
    expect(await d.emails(paid.orderId)).toContainEqual([
      'order-confirmation',
      'new-holder@example.test',
    ])
  })
})

describe('"Pay now"', () => {
  const payNow = (d: OrderDesk, who: Member, orderId: string) =>
    as(d, who, 'post', `/editions/${d.edition}/orders/${orderId}/payment-attempts`)

  it('starts a payment attempt for an unpaid order within its hold, and sends the buyer back to the convention’s page', async () => {
    const d = await orderDesk(app)
    const buyer = await member()
    const order = await placed(d, buyer)

    const res = await payNow(d, buyer, order.orderId).expect(201)

    const attemptId = (res.body as StartedAttempt).redirectUrl.split('/').pop()!
    // No result token travels with "Pay now": the buyer returns to where their orders are.
    const back = new URL(fake().started(attemptId)!.returnUrl)
    expect(back.origin).toBe(new URL(env.PORTAL_URL).origin)
    expect(back.pathname).toBe(`/conventions/${d.t.slug}`)
    expect(back.search).toBe('')
    // The order itself is as it was.
    expect(await d.order(order.orderId)).toMatchObject({ status: 'awaiting-payment' })
    await d.confirm(attemptId)
    expect((await mine(d, buyer))[0]).toMatchObject({ status: 'paid' })
  })

  it('starts nothing once the hold has ended, and nothing for another account’s order', async () => {
    const d = await orderDesk(app)
    const [buyer, other] = [await member(), await member()]
    const order = await placed(d, buyer)

    await payNow(d, other, order.orderId).expect(404)
    await setColumn('orders', order.orderId, 'hold_ends_at', '2020-01-01T00:00:00Z')
    const late = await payNow(d, buyer, order.orderId).expect(409)

    expect(late.body).toMatchObject({ code: 'order.hold-ended' })
    expect(await storedRows('payment_attempts', d.t.id)).toEqual([])
    // The list says the same of the order before "Pay now" is pressed.
    expect((await mine(d, buyer))[0]).toMatchObject({ status: 'awaiting-payment', payable: false })
  })
})

describe('"Buy more"', () => {
  it('adds an add-on and merchandise to a paid order: no ticket, and the same ticket holder', async () => {
    const { d, workshop, pin } = await deskWithExtras()
    const buyer = await member()
    const first = await bought(d, buyer)

    const res = await more(
      d,
      buyer,
      first,
      { addOnIds: [workshop], items: [{ variantId: pin.variantId, quantity: 2 }] },
      14000,
    ).expect(201)

    const added = res.body as PlacedOrder
    expect(await d.order(added.orderId)).toMatchObject({
      status: 'awaiting-payment',
      extends_order_id: first.orderId,
      // The ticket holder is the first order's, whatever the request named.
      holder_name: 'Ada Lovelace',
      age_band: null,
      total_minor: 14000,
    })
    const lines = (await storedRows('order_lines', d.t.id)).filter(
      (line) => line.order_id === added.orderId,
    )
    expect(lines.map((line) => line.kind).sort()).toEqual(['add_on', 'merchandise'])
  })

  it('joins the first order’s QR code once paid, and both tell what was bought on it', async () => {
    const { d, workshop, pin } = await deskWithExtras()
    const buyer = await member()
    const first = await bought(d, buyer)
    const added = (
      await more(
        d,
        buyer,
        first,
        { addOnIds: [workshop], items: [{ variantId: pin.variantId, quantity: 1 }] },
        9000,
      ).expect(201)
    ).body as PlacedOrder

    await d.pay(added)

    const carried = await storedRows('order_qr_code_orders', d.t.id)
    expect(carried.map((row) => row.order_id).sort()).toEqual([first.orderId, added.orderId].sort())
    expect(new Set(carried.map((row) => row.qr_code_id)).size).toBe(1)
    expect(await storedRows('order_qr_codes', d.t.id)).toHaveLength(1)
    // Its confirmation is queued as any paid order's, and carries the code the order now has.
    expect(await d.emails(added.orderId)).toEqual([
      ['order-confirmation', buyer.email.toLowerCase()],
    ])
    for (const order of await mine(d, buyer)) {
      expect(order.bought).toEqual({
        ticketTypeId: d.standard,
        addOnIds: [workshop],
        itemIds: [pin.id],
      })
    }
  })

  it('takes an add-on once, also while it still awaits payment, and merchandise again', async () => {
    const { d, workshop, room, pin } = await deskWithExtras()
    const buyer = await member()
    const first = await bought(d, buyer, {
      cart: { ticket: { ticketTypeId: d.standard }, addOnIds: [room] },
    })
    // Held by a "Buy more" order that is not paid yet.
    await more(d, buyer, first, { addOnIds: [workshop] }, 4000).expect(201)

    for (const addOnId of [room, workshop]) {
      const res = await more(d, buyer, first, { addOnIds: [addOnId] }, 0).expect(409)
      expect(res.body).toMatchObject({
        code: 'order.unavailable',
        params: { kind: 'add-on', id: addOnId },
      })
    }
    const pins = { items: [{ variantId: pin.variantId, quantity: 1 }] }
    await more(d, buyer, first, pins, 5000).expect(201)
    await more(d, buyer, first, pins, 5000).expect(201)
  })

  it('sells no ticket, and nothing at all for an empty cart', async () => {
    const { d } = await deskWithExtras()
    const buyer = await member()
    const first = await bought(d, buyer)

    const ticket = await place(d, buyer, {
      extendsOrderId: first.orderId,
      ageBand: null,
    }).expect(409)
    expect(ticket.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'ticket-type', id: d.standard },
    })
    const empty = await more(d, buyer, first, {}, 0).expect(409)
    expect(empty.body).toMatchObject({ code: 'order.unavailable', params: { kind: 'empty' } })
  })

  it('is paid at once when there is nothing to pay, on the same QR code', async () => {
    const { d, room } = await deskWithExtras()
    const buyer = await member()
    const first = await bought(d, buyer)

    const res = await more(d, buyer, first, { addOnIds: [room] }, 0).expect(201)

    expect(res.body).toMatchObject({ status: 'paid', totalMinor: 0 })
    const carried = await storedRows('order_qr_code_orders', d.t.id)
    expect(carried).toHaveLength(2)
    expect(new Set(carried.map((row) => row.qr_code_id)).size).toBe(1)
  })

  it('offers the merchandise alone to an order of merchandise alone, also with merch-only orders off', async () => {
    const { d, room, pin } = await deskWithExtras()
    const buyer = await member()
    await setCatalogSettings(d.t.id, d.edition, { merchOnlyEnabled: true })
    const pins = { items: [{ variantId: pin.variantId, quantity: 1 }] }
    const first = await bought(d, buyer, {
      cart: { ticket: null, ...pins },
      ageBand: null,
      expectedTotalMinor: 5000,
    })
    await setCatalogSettings(d.t.id, d.edition, { merchOnlyEnabled: false })

    await more(d, buyer, first, pins, 5000).expect(201)
    const addOn = await more(d, buyer, first, { addOnIds: [room] }, 0).expect(409)

    expect(addOn.body).toMatchObject({ code: 'order.unavailable', params: { kind: 'add-on' } })
  })

  it('adds to the account’s own paid order of the same edition alone', async () => {
    const { d, room } = await deskWithExtras()
    const [buyer, other] = [await member(), await member()]
    const paid = await bought(d, buyer)
    const unpaid = await placed(d, buyer)
    const sibling = await addEdition(d.t.id)
    await setPublished(sibling, true)
    const cart = { addOnIds: [room] }

    // An order that is not paid adds to nothing, and neither does one of another edition.
    const notPaid = await more(d, buyer, unpaid, cart, 0).expect(409)
    expect(notPaid.body).toMatchObject({ code: 'order.not-extendable' })
    const elsewhere = await as(d, buyer, 'post', `/editions/${sibling}/shop/orders`, {
      cart: { ticket: null, ...cart },
      holderName: 'Ada Lovelace',
      ageBand: null,
      expectedTotalMinor: 0,
      botCheckToken: STAND_IN_TOKEN,
      extendsOrderId: paid.orderId,
    })
    expect([elsewhere.status, (elsewhere.body as Row).code]).toEqual([409, 'order.not-extendable'])
    // Another account's order is not there at all.
    const foreign = await more(d, other, paid, cart, 0).expect(404)
    expect(foreign.body).toMatchObject({ code: 'request.not-found' })
    // A canceled order is no longer paid.
    await d.head('post', `/orders/${paid.orderId}/cancel`, { reason: 'Asked to' }).expect(200)
    const canceled = await more(d, buyer, paid, cart, 0).expect(409)
    expect(canceled.body).toMatchObject({ code: 'order.not-extendable' })
    expect(await storedRows('orders', d.t.id)).toHaveLength(2)
  })

  // A changed email is the one way a ticket passes to another person
  // (docs/specs/0006-order-management.md, C2): the account the order stays on adds nothing to
  // it from then on, and never gets the QR code its new holder was sent.
  it('adds nothing to an order whose email an org changed, and joins no code of it', async () => {
    const { d, room } = await deskWithExtras()
    const buyer = await member()
    const first = await bought(d, buyer)
    await d
      .head('put', `/orders/${first.orderId}/email`, { email: 'new-holder@example.test' })
      .expect(200)

    const refused = await more(d, buyer, first, { addOnIds: [room] }, 0).expect(409)

    expect(refused.body).toMatchObject({ code: 'order.not-extendable' })
    // The list no longer offers it either: nothing is added to an order that left the account's
    // address.
    const listed = (await mine(d, buyer)).find((order) => order.id === first.orderId)!
    expect(listed.bought).toBeNull()
  })

  it('gives an order paid after its first order passed on a QR code of its own', async () => {
    const { d, pin } = await deskWithExtras()
    const buyer = await member()
    const first = await bought(d, buyer)
    const added = (
      await more(d, buyer, first, { items: [{ variantId: pin.variantId, quantity: 1 }] }, 5000)
    ).body as PlacedOrder
    await d
      .head('put', `/orders/${first.orderId}/email`, { email: 'new-holder@example.test' })
      .expect(200)

    await d.pay(added)

    const carried = await storedRows('order_qr_code_orders', d.t.id)
    const codeOf = (orderId: string) => carried.find((row) => row.order_id === orderId)!.qr_code_id
    expect(codeOf(added.orderId)).not.toBe(codeOf(first.orderId))
  })

  // B6: a visitor has no "Buy more": buying again is a new order with a QR code of its own.
  it('is nothing a visitor can ask for', async () => {
    const { d, room } = await deskWithExtras()
    const paid = await bought(d, await member())

    const res = await request(app.getHttpServer())
      .post(`/public/tenants/${d.t.slug}/editions/${d.slug}/shop/orders`)
      .send({
        cart: { ticket: null, addOnIds: [room] },
        holderName: 'Ada Lovelace',
        ageBand: null,
        email: 'visitor@example.test',
        emailConfirmation: 'visitor@example.test',
        expectedTotalMinor: 0,
        botCheckToken: STAND_IN_TOKEN,
        extendsOrderId: paid.orderId,
      })
      .expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid' })
  })

  // A discount code lowers what is bought later as it lowers a first order: the account's quote
  // prices the cart as an addition to the order it names, which the quote for anyone cannot.
  it('is priced with a discount code as it is then placed: the same lines and the same total', async () => {
    const { d, workshop, pin } = await deskWithExtras()
    await addDiscountCode(d.t.id, d.edition, { code: 'craft20', percent: 20, addOnIds: [workshop] })
    const buyer = await member()
    const first = await bought(d, buyer)
    const cart = { addOnIds: [workshop], items: [{ variantId: pin.variantId, quantity: 1 }] }

    const res = await quote(d, buyer, {
      ticket: null,
      ...cart,
      discountCode: 'CRAFT20',
      extendsOrderId: first.orderId,
    }).expect(200)

    const priced = res.body as Quote
    expect(priced.lines.map((line) => [line.kind, line.amountMinor])).toEqual([
      ['add_on', 4000],
      ['merchandise', 5000],
      ['discount', -800],
    ])
    expect(priced.totalMinor).toBe(8200)
    const added = await place(d, buyer, {
      cart: { ticket: null, ...cart },
      ageBand: null,
      expectedTotalMinor: priced.totalMinor,
      extendsOrderId: first.orderId,
      discountCode: 'CRAFT20',
    }).expect(201)
    expect(added.body).toMatchObject({ status: 'awaiting-payment', totalMinor: 8200 })
    // Asked of the quote for anyone, the same cart is an add-on with no ticket.
    const open = await request(app.getHttpServer())
      .post(`/public/tenants/${d.t.slug}/editions/${d.slug}/shop/quote`)
      .send({ ticket: null, ...cart, discountCode: 'CRAFT20' })
      .expect(409)
    expect(open.body).toMatchObject({ code: 'order.unavailable', params: { kind: 'add-on' } })
  })

  it('is priced as it is placed without a code too, and for a first order as anyone’s cart is', async () => {
    const { d, workshop, room } = await deskWithExtras()
    const buyer = await member()
    const first = await bought(d, buyer, {
      cart: { ticket: { ticketTypeId: d.standard }, addOnIds: [room] },
    })
    const adding = { ticket: null, extendsOrderId: first.orderId }

    const priced = await quote(d, buyer, { ...adding, addOnIds: [workshop] }).expect(200)
    expect(priced.body).toMatchObject({ totalMinor: 4000, lines: [{ kind: 'add_on' }] })
    // What placing refuses, the quote refuses alike: an add-on bought already, a ticket, nothing.
    const again = await quote(d, buyer, { ...adding, addOnIds: [room] }).expect(409)
    expect(again.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'add-on', id: room },
    })
    const empty = await quote(d, buyer, adding).expect(409)
    expect(empty.body).toMatchObject({ code: 'order.unavailable', params: { kind: 'empty' } })
    // With no order named it is the cart of a first order.
    const ticket = await quote(d, buyer, { ticket: { ticketTypeId: d.standard } }).expect(200)
    expect(ticket.body).toMatchObject({ totalMinor: 10000, lines: [{ kind: 'ticket' }] })
  })

  it('is priced for the account’s own paid order of the same edition alone', async () => {
    const { d, workshop } = await deskWithExtras()
    const [buyer, other] = [await member(), await member()]
    const paid = await bought(d, buyer)
    const unpaid = await placed(d, buyer)
    const sibling = await addEdition(d.t.id)
    await setPublished(sibling, true)
    const cart = { ticket: null, addOnIds: [workshop] }

    const notPaid = await quote(d, buyer, { ...cart, extendsOrderId: unpaid.orderId }).expect(409)
    expect(notPaid.body).toMatchObject({ code: 'order.not-extendable' })
    const elsewhere = await quote(d, buyer, { ...cart, extendsOrderId: paid.orderId }, sibling)
    expect([elsewhere.status, (elsewhere.body as Row).code]).toEqual([409, 'order.not-extendable'])
    // Another account's order is not there at all, and no edition that is not published.
    const foreign = await quote(d, other, { ...cart, extendsOrderId: paid.orderId }).expect(404)
    expect(foreign.body).toMatchObject({ code: 'request.not-found' })
    await setPublished(sibling, false)
    await quote(d, buyer, cart, sibling).expect(404)
    // An order an org moved to another email is added to no longer.
    await d
      .head('put', `/orders/${paid.orderId}/email`, { email: 'new-holder@example.test' })
      .expect(200)
    const passed = await quote(d, buyer, { ...cart, extendsOrderId: paid.orderId }).expect(409)
    expect(passed.body).toMatchObject({ code: 'order.not-extendable' })
    // A visitor has no such quote.
    await request(app.getHttpServer())
      .post(`/editions/${d.edition}/shop/quote`)
      .set('X-Tenant-Slug', d.t.slug)
      .send(cart)
      .expect(401)
  })

  // The tries of a discount code are one count of an address, whichever quote or order spends
  // them: a code that is refused is a try, a code that can be used is none.
  it('tries a discount code as the quote for anyone does', async () => {
    const { d, workshop } = await deskWithExtras()
    await addDiscountCode(d.t.id, d.edition, { code: 'craft20', percent: 20, addOnIds: [workshop] })
    const buyer = await member()
    const first = await bought(d, buyer)
    const ip = '198.51.100.251'
    const { limit } = ROUTE_RATE_LIMITS.discountCodeTries
    const asked = (discountCode: string, addOnIds = [workshop]) =>
      quote(d, buyer, { ticket: null, addOnIds, discountCode, extendsOrderId: first.orderId }).set(
        'X-Forwarded-For',
        ip,
      )

    for (let priced = 0; priced <= limit; priced += 1) await asked('craft20').expect(200)
    // A cart that cannot be had is told first, and tries no code either.
    for (let priced = 0; priced <= limit; priced += 1) {
      const res = await asked('nobody-knows', [d.standard]).expect(409)
      expect(res.body).toMatchObject({ code: 'order.unavailable', params: { kind: 'add-on' } })
    }
    for (let tried = 1; tried < limit; tried += 1) {
      const res = await asked(`guess-${tried}`).expect(409)
      expect(res.body).toMatchObject({ code: 'discount-code.refused' })
    }
    // The last try of the address is spent by the quote for anyone.
    await request(app.getHttpServer())
      .post(`/public/tenants/${d.t.slug}/editions/${d.slug}/shop/quote`)
      .set('X-Forwarded-For', ip)
      .send({ ticket: { ticketTypeId: d.standard }, discountCode: 'one-more-guess' })
      .expect(409)

    // A code that can be used is answered as one that cannot: nothing more is told of either.
    const res = await asked('craft20').expect(429)
    expect(res.body).toMatchObject({ code: 'request.rate-limited' })
    // A cart with no code is still priced.
    await quote(d, buyer, { ticket: null, addOnIds: [workshop], extendsOrderId: first.orderId })
      .set('X-Forwarded-For', ip)
      .expect(200)
  })

  // B4 and B5: the scanner shows both orders on the one code, each is canceled on its own, and
  // the code is refused once every order on it is canceled.
  it('shows both orders at the scanner, each canceled on its own', async () => {
    const { d, pin } = await deskWithExtras()
    const buyer = await member()
    const first = await bought(d, buyer)
    const added = (
      await more(d, buyer, first, { items: [{ variantId: pin.variantId, quantity: 1 }] }, 5000)
    ).body as PlacedOrder
    await d.pay(added)
    const token = await addOrderLinkWithToken(d.t.id, d.edition, first.orderId)
    const opened = (
      await request(app.getHttpServer())
        .post('/public/order-links/open')
        .send({ token })
        .expect(200)
    ).body as OpenedOrderLink
    const code = opened.state === 'valid' ? opened.order.qrCode! : ''
    const scanner = await addScanner(d.t.id, d.edition)
    const scan = () =>
      request(app.getHttpServer())
        .post('/scanner/scans')
        .set('Authorization', `Bearer ${scanner.token}`)
        .send({ code })
    const numbers = async () =>
      ((await scan().expect(200)).body as ScanResult).orders.map((order) => order.number).sort()

    expect(await numbers()).toEqual([first.number, added.number].sort())
    await d.head('post', `/orders/${first.orderId}/cancel`, { reason: 'Asked to' }).expect(200)
    expect(await numbers()).toEqual([added.number])
    await d.head('post', `/orders/${added.orderId}/cancel`, { reason: 'Asked to' }).expect(200)

    const refused = await scan().expect(409)
    expect(refused.body).toMatchObject({ code: 'scan.not-valid', params: { reason: 'canceled' } })
  })

  // Paid, it joins the QR code of the order it adds to under the lock of that order's row. That
  // row is locked before any limit, as placing a "Buy more" order locks it: two that take them
  // the other way round would wait for each other.
  it.each([
    ['an org marks it paid', 'marked'],
    ['a payment after its hold pays it', 'late'],
  ] as const)('locks the order it adds to before its limits when %s', async (_, how) => {
    const { d, pin } = await deskWithExtras()
    const buyer = await member()
    const first = await bought(d, buyer)
    const added = (
      await more(d, buyer, first, { items: [{ variantId: pin.variantId, quantity: 1 }] }, 5000)
    ).body as PlacedOrder
    const attemptId = await d.start(added)
    await setColumn('orders', added.orderId, 'holds', false)
    await setColumn('orders', added.orderId, 'status', how === 'late' ? 'expired' : 'needs-review')

    // The variant is another transaction's for now: the request waits at its limits, and that
    // transaction then asks for the row of the first order without waiting.
    const other = await openTransaction()
    let firstIsLocked = false
    let settled: Promise<number>
    try {
      await other.sql`select id from merchandise_variants where id = ${pin.variantId} for update`
      settled =
        how === 'late'
          ? d.confirm(attemptId).then(() => 200)
          : Promise.resolve(d.head('post', `/orders/${added.orderId}/mark-paid`)).then(
              (res) => res.status,
            )
      await sleep(300)
      await other.sql`select id from orders where id = ${first.orderId} for update nowait`.catch(
        (error: { code?: string }) => {
          firstIsLocked = error.code === '55P03'
        },
      )
    } finally {
      await other.rollback()
    }

    expect(await settled).toBe(200)
    expect(firstIsLocked).toBe(true)
    expect(await d.order(added.orderId)).toMatchObject({ status: 'paid', holds: true })
    const carried = await storedRows('order_qr_code_orders', d.t.id)
    expect(new Set(carried.map((row) => row.qr_code_id)).size).toBe(1)
  })
})
