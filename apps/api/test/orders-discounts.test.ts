import { type NestExpressApplication } from '@nestjs/platform-express'
import { type OrderDetail, type Quote } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTE_RATE_LIMITS } from '../src/common/rate-limit/route-rate-limit'
import { STAND_IN_TOKEN } from '../src/modules/checkout/bot-check'
import { OrderExpiry } from '../src/modules/checkout/order-expiry.service'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import { type OrderDesk, orderDesk } from './order-desk'
import {
  addDiscountCode,
  addEdition,
  addMerchandiseItem,
  addTicketType,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  offerWith,
  setColumn,
} from './tenants'

// A discount code in checkout (docs/specs/0008-discount-codes.md, K1-K8 and E1-E3): the buyer
// enters one at the Summary, it lowers what it applies to as a line of its own, and its use is
// held, released and taken again with the order's stock.

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

const refused = { code: 'discount-code.refused' }
const usedUp = { code: 'order.unavailable', params: { kind: 'discount-code' } }
/** Each test asks from an address of its own: the tries of a code are counted by address. */
let address = 0
const from = () => `198.51.100.${(address += 1) % 250}`

const quote = (d: OrderDesk, body: object, ip = from()) =>
  request(app.getHttpServer())
    .post(`/public/tenants/${d.t.slug}/editions/${d.slug}/shop/quote`)
    .set('X-Forwarded-For', ip)
    .send({ ticket: { ticketTypeId: d.standard }, ...body })
/** A visitor's order for the ticket type with a code, at the total the buyer saw. */
const placeWith = (
  d: OrderDesk,
  discountCode: string | undefined,
  expectedTotalMinor: number,
  more = {},
  ip = from(),
) =>
  request(app.getHttpServer())
    .post(`/public/tenants/${d.t.slug}/editions/${d.slug}/shop/orders`)
    .set('X-Forwarded-For', ip)
    .send({
      cart: { ticket: { ticketTypeId: d.standard } },
      holderName: 'Ada Lovelace',
      ageBand: 'adult',
      email: 'buyer@example.test',
      emailConfirmation: 'buyer@example.test',
      providerConsentAccepted: true,
      botCheckToken: STAND_IN_TOKEN,
      discountCode,
      expectedTotalMinor,
      ...more,
    })

describe('a discount code at the Summary', () => {
  it('is a line of its own in the quote, read without regard to case', async () => {
    const d = await orderDesk(app)
    await addDiscountCode(d.t.id, d.edition, { code: 'early10', ticketTypeIds: [d.standard] })

    const res = await quote(d, { discountCode: ' EARLY10 ' }).expect(200)

    const priced = res.body as Quote
    expect(priced.lines.at(-1)).toMatchObject({
      kind: 'discount',
      name: 'early10',
      amountMinor: -1000,
    })
    expect(priced.totalMinor).toBe(9000)
    // Without a code the quote is what it was.
    expect(((await quote(d, {}).expect(200)).body as Quote).totalMinor).toBe(10000)
  })

  // The buyer is told only that the code cannot be used for this order.
  it('is refused alike when it is unknown, outside its window, ended, used up or applies to nothing', async () => {
    const d = await orderDesk(app)
    const other = await addTicketType(d.t.id, d.edition, { name: 'Other' })
    const sibling = await addEdition(d.t.id)
    const of = { ticketTypeIds: [d.standard] }
    await addDiscountCode(d.t.id, d.edition, { code: 'not-yet', validFrom: '2090-01-01', ...of })
    await addDiscountCode(d.t.id, d.edition, { code: 'too-late', validUntil: '2021-01-01', ...of })
    await addDiscountCode(d.t.id, d.edition, { code: 'ended', ended: true, ...of })
    await addDiscountCode(d.t.id, d.edition, { code: 'for-another', ticketTypeIds: [other] })
    await addDiscountCode(d.t.id, sibling, { code: 'of-a-sibling' })
    const last = await addDiscountCode(d.t.id, d.edition, {
      code: 'last-use',
      usageLimit: 1,
      ...of,
    })
    const holder = await d.place()
    await setColumn('orders', holder.orderId, 'discount_code_id', last.id)

    const answers = []
    for (const discountCode of [
      'nobody-knows',
      'not-yet',
      'too-late',
      'ended',
      'for-another',
      'of-a-sibling',
      'last-use',
      'not a code at all!',
    ]) {
      const res = await quote(d, { discountCode })
      expect(res.status, discountCode).toBe(409)
      answers.push(res.body)
    }
    for (const answer of answers) expect(answer).toEqual(answers[0])
    expect(answers[0]).toMatchObject(refused)
  })

  it('is tried only so often from one address', async () => {
    const d = await orderDesk(app)
    const ip = from()
    const { limit } = ROUTE_RATE_LIMITS.discountCodeTries
    for (let tried = 0; tried < limit; tried += 1) {
      await quote(d, { discountCode: `guess-${tried}` }, ip).expect(409)
    }

    const res = await quote(d, { discountCode: 'one-more' }, ip)

    expect(res.status).toBe(429)
    expect(res.body).toMatchObject({ code: 'request.rate-limited' })
    // A cart with no code is still priced.
    await quote(d, {}, ip).expect(200)
  })

  // An order tries its code as a quote does: placing one is no way around the limit.
  it('is tried only so often from one address by an order too, a visitor’s or an account’s', async () => {
    const d = await orderDesk(app)
    const buyer = await member()
    const ip = from()
    const { limit } = ROUTE_RATE_LIMITS.discountCodeTries
    await quote(d, { discountCode: 'guess-in-a-quote' }, ip).expect(409)
    for (let tried = 1; tried < limit; tried += 1) {
      const res = await placeWith(d, `guess-${tried}`, 9000, {}, ip).expect(409)
      expect(res.body).toMatchObject(usedUp)
    }

    const visitor = await placeWith(d, 'one-more', 9000, {}, ip)
    const account = await request(app.getHttpServer())
      .post(`/editions/${d.edition}/shop/orders`)
      .use(session(buyer.token))
      .set('X-Tenant-Slug', d.t.slug)
      .set('X-Forwarded-For', ip)
      .send({
        cart: { ticket: { ticketTypeId: d.standard } },
        holderName: 'Ada Lovelace',
        ageBand: 'adult',
        providerConsentAccepted: true,
        botCheckToken: STAND_IN_TOKEN,
        discountCode: 'and-another',
        expectedTotalMinor: 9000,
      })

    for (const res of [visitor, account]) {
      expect(res.status).toBe(429)
      expect(res.body).toMatchObject({ code: 'request.rate-limited' })
    }
    // An order with no code is still placed.
    await placeWith(d, undefined, 10000, {}, ip).expect(201)
  })

  it('never lowers a ticket type excluded from discounts', async () => {
    const d = await orderDesk(app)
    await setColumn('ticket_types', d.standard, 'discounts_excluded', true)
    await addDiscountCode(d.t.id, d.edition, { code: 'early10', ticketTypeIds: [d.standard] })

    expect((await quote(d, { discountCode: 'early10' }).expect(409)).body).toMatchObject(refused)
  })
})

describe('an order placed with a discount code', () => {
  it('names its code, carries what the code took off as a line and is placed at the total the buyer saw', async () => {
    const d = await orderDesk(app)
    const code = await addDiscountCode(d.t.id, d.edition, {
      code: 'early10',
      ticketTypeIds: [d.standard],
    })

    // The total without the discount is not the one the buyer saw.
    const stale = await placeWith(d, 'early10', 10000).expect(409)
    expect(stale.body).toMatchObject({ code: 'order.total-changed', params: { totalMinor: 9000 } })

    const res = await placeWith(d, 'Early10', 9000).expect(201)

    const { orderId } = res.body as { orderId: string }
    expect(await d.order(orderId)).toMatchObject({
      status: 'awaiting-payment',
      total_minor: 9000,
      discount_code_id: code.id,
    })
    const page = (await d.head('get', `/orders/${orderId}`).expect(200)).body as OrderDetail
    expect(page.discountCode).toBe('early10')
    expect(page.lines.map((line) => [line.kind, line.amountMinor])).toEqual([
      ['ticket', 10000],
      ['discount', -1000],
    ])
  })

  // Free entry: its holder checks out as any buyer and gets a QR code, with no payment step.
  it('is paid at once when a 100% code brings its total to zero', async () => {
    const d = await orderDesk(app)
    await addDiscountCode(d.t.id, d.edition, {
      code: 'guest100',
      percent: 100,
      ticketTypeIds: [d.standard],
    })

    const res = await placeWith(d, 'guest100', 0).expect(201)

    const placed = res.body as { orderId: string; status: string; totalMinor: number }
    expect(placed).toMatchObject({ status: 'paid', totalMinor: 0 })
    expect(await d.stored('order_qr_code_orders')).toMatchObject([{ order_id: placed.orderId }])
    expect(await d.emails(placed.orderId)).toEqual([['order-confirmation', 'buyer@example.test']])
    expect(await d.stored('payment_attempts')).toEqual([])
  })

  it('pays for merchandise at its price beside a ticket a 100% code paid for', async () => {
    const d = await orderDesk(app)
    const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 5 })
    await offerWith(d.t.id, d.edition, d.standard, { itemIds: [pin.id] })
    await addDiscountCode(d.t.id, d.edition, {
      code: 'guest100',
      percent: 100,
      ticketTypeIds: [d.standard],
    })

    const res = await placeWith(d, 'guest100', 5000, {
      cart: {
        ticket: { ticketTypeId: d.standard },
        items: [{ variantId: pin.variantId, quantity: 1 }],
      },
    }).expect(201)

    expect(res.body).toMatchObject({ status: 'awaiting-payment', totalMinor: 5000 })
  })

  it('is not placed with a code that was used up or ended since the buyer entered it', async () => {
    const d = await orderDesk(app)
    const of = { ticketTypeIds: [d.standard] }
    await addDiscountCode(d.t.id, d.edition, { code: 'last-use', usageLimit: 1, ...of })
    await addDiscountCode(d.t.id, d.edition, { code: 'ended', ended: true, ...of })
    await placeWith(d, 'last-use', 9000).expect(201)

    for (const code of ['last-use', 'ended', 'nobody-knows']) {
      const res = await placeWith(d, code, 9000, {
        email: 'next@example.test',
        emailConfirmation: 'next@example.test',
      }).expect(409)
      expect(res.body, code).toMatchObject(usedUp)
    }
    expect(await d.stored('orders')).toHaveLength(1)
  })
})

describe('a use of a discount code', () => {
  /** A code of one use, an order that holds it, and the next buyer's try. */
  async function lastUse() {
    const d = await orderDesk(app)
    const code = await addDiscountCode(d.t.id, d.edition, {
      code: 'last-use',
      usageLimit: 1,
      ticketTypeIds: [d.standard],
    })
    const res = await placeWith(d, 'last-use', 9000).expect(201)
    const first = res.body as { orderId: string; number: string; resultToken: string }
    const next = () =>
      placeWith(d, 'last-use', 9000, {
        email: 'next@example.test',
        emailConfirmation: 'next@example.test',
      })
    return {
      d,
      code,
      first: { ...first, status: 'awaiting-payment' as const, totalMinor: 9000 },
      next,
    }
  }

  it('is released when its order expires, for the next buyer to take', async () => {
    const { d, first, next } = await lastUse()
    await next().expect(409)
    await setColumn(
      'orders',
      first.orderId,
      'hold_ends_at',
      new Date(Date.now() - 60_000).toISOString(),
    )

    await app.get(OrderExpiry).run(new Date(), { tenantId: d.t.id })

    await next().expect(201)
  })

  it('is taken again by a payment after the hold, while it is still there', async () => {
    const { d, first } = await lastUse()

    await d.paidLate(first, () => Promise.resolve())

    expect(await d.order(first.orderId)).toMatchObject({ status: 'paid', holds: true })
  })

  it('sends a payment after the hold to review once it is gone, until an org raises the limit', async () => {
    const { d, code, first, next } = await lastUse()
    // The hold ended, and the one use went to the next buyer before the payment arrived.
    await d.paidLate(first, async () => {
      await next().expect(201)
    })
    expect(await d.order(first.orderId)).toMatchObject({
      status: 'needs-review',
      holds: false,
      review_cause: 'unavailable',
    })

    const refusedMark = await d.head('post', `/orders/${first.orderId}/mark-paid`).expect(409)

    expect(refusedMark.body).toMatchObject(usedUp)
    await setColumn('discount_codes', code.id, 'usage_limit', 2)
    await d.head('post', `/orders/${first.orderId}/mark-paid`).expect(200)
    expect(await d.order(first.orderId)).toMatchObject({ status: 'paid', holds: true })
  })
})
