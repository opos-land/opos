import { type NestExpressApplication } from '@nestjs/platform-express'
import { type PlacedOrder, RESULT_TOKEN_HEADER, type StartedAttempt } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { STAND_IN_TOKEN } from '../src/modules/checkout/bot-check'
import { OrderExpiry } from '../src/modules/checkout/order-expiry.service'
import { FAKE_ACCOUNT, type FakeProvider } from '../src/modules/payments/fake-provider'
import { PROVIDER_MODULES } from '../src/modules/payments/payment-providers'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import {
  addEdition,
  addTicketType,
  closeTenantDb,
  connectFake,
  deleteCreatedTenants,
  makeShopReady,
  openShop,
  restore,
  setColumn,
  setPublished,
  storedRows,
  suspend,
  tenantWithHead,
} from './tenants'

// The expiry job (docs/specs/0004-checkout-and-orders.md, Y6, H1, H3): when the hold of an order
// awaiting payment ends, the provider's module is asked about its open attempts. With no payment
// made the order expires and releases what it held; a payment made counts whenever it is found.

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

const MINUTE = 60_000
const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE).toISOString()
const fake = () => app.get<Map<string, FakeProvider>>(PROVIDER_MODULES).get('fake')!
const expiry = () => app.get(OrderExpiry)

/** A published edition with an open shop, a connected fake account and one ticket type. */
async function shop(account = 'demo', capacity?: number) {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id)
  await setPublished(edition, true)
  await makeShopReady(t.id, edition)
  await connectFake(t.id, account)
  await openShop(t.id, edition)
  const standard = await addTicketType(t.id, edition, { capacity })
  const editions = await request(app.getHttpServer()).get(`/public/tenants/${t.slug}/editions`)
  const slug = (editions.body as { slug: string }[])[0]!.slug
  const order = (email: string) =>
    request(app.getHttpServer())
      .post(`/public/tenants/${t.slug}/editions/${slug}/shop/orders`)
      .send({
        cart: { ticket: { ticketTypeId: standard } },
        holderName: 'Ada',
        ageBand: 'adult',
        email,
        emailConfirmation: email,
        providerConsentAccepted: true,
        expectedTotalMinor: 10000,
        botCheckToken: STAND_IN_TOKEN,
      })
  const place = async (email = 'buyer@example.test') =>
    (await order(email).expect(201)).body as PlacedOrder
  const started = async (placed: PlacedOrder) => {
    const res = await request(app.getHttpServer())
      .post(`/public/tenants/${t.slug}/orders/${placed.orderId}/payment-attempts`)
      .set(RESULT_TOKEN_HEADER, placed.resultToken)
      .expect(201)
    return (res.body as StartedAttempt).redirectUrl.split('/').pop()!
  }
  /** Ends the hold of the order, as time does. */
  const endHold = (placed: PlacedOrder) =>
    setColumn('orders', placed.orderId, 'hold_ends_at', ago(1))
  const stored = async (placed: PlacedOrder) =>
    (await storedRows('orders', t.id)).find((row) => row.id === placed.orderId)!
  const attempts = () => storedRows('payment_attempts', t.id)
  const emails = async () =>
    (await storedRows('order_emails', t.id)).map((row) => [row.kind, row.recipient])
  return { t, edition, order, place, started, endHold, stored, attempts, emails }
}

describe('the expiry of orders', () => {
  it('expires an order whose hold ended with no payment: it holds nothing, and its buyer is told', async () => {
    const s = await shop()
    const [late, fresh] = [await s.place(), await s.place('other@example.test')]
    const attemptId = await s.started(late)
    await s.endHold(late)

    await expiry().run()

    expect(await s.stored(late)).toMatchObject({ status: 'expired', holds: false, paid_at: null })
    // An attempt nobody paid ended with it.
    expect(await s.attempts()).toMatchObject([{ id: attemptId, status: 'ended' }])
    expect(await s.emails()).toEqual([['order-expired', 'buyer@example.test']])
    // An order within its hold is left as it is.
    expect(await s.stored(fresh)).toMatchObject({ status: 'awaiting-payment', holds: true })

    // Once expired, it is not expired again.
    await expiry().run()
    expect(await s.emails()).toHaveLength(1)
  })

  it('expires an order no attempt was ever started for', async () => {
    const s = await shop()
    const placed = await s.place()
    await s.endHold(placed)

    await expiry().run()

    expect(await s.stored(placed)).toMatchObject({ status: 'expired', holds: false })
  })

  it('releases what the order held: the last ticket is on sale again', async () => {
    const s = await shop('demo', 1)
    const placed = await s.place()
    await s.order('next@example.test').expect(409)
    await s.endHold(placed)

    await expiry().run()

    await s.order('next@example.test').expect(201)
  })

  // The hold does not limit when the order can be paid: a payment made counts as made in time
  // whenever its confirmation comes, also when the provider's notification never did.
  it('does not expire an order the provider reports a payment for: the payment is confirmed', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    fake().pay(attemptId)
    await s.endHold(placed)

    await expiry().run()

    expect(await s.stored(placed)).toMatchObject({ status: 'paid', holds: true })
    expect(await s.attempts()).toMatchObject([{ id: attemptId, status: 'paid' }])
    expect(await s.emails()).toEqual([['order-confirmation', 'buyer@example.test']])
  })

  it('keeps the reason of an attempt that failed, and expires its order', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    await request(app.getHttpServer())
      .post(`/payments/fake/notifications/${attemptId}/additional`)
      .send(fake().fail(attemptId, 'canceled'))
      .expect(200)
    await s.endHold(placed)

    await expiry().run()

    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
    expect(await s.attempts()).toMatchObject([{ status: 'failed', failure_reason: 'canceled' }])
  })

  // Whether a payment was made is not known: the order waits for the provider to answer.
  it('leaves an order as it is while its provider is out of reach', async () => {
    const s = await shop(FAKE_ACCOUNT.stateUnavailable)
    const placed = await s.place()
    await s.started(placed)
    await s.endHold(placed)

    await expiry().run()

    expect(await s.stored(placed)).toMatchObject({ status: 'awaiting-payment', holds: true })
    expect(await s.emails()).toEqual([])

    await connectFake(s.t.id, 'demo')
    await expiry().run()
    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
  })

  it('passes by the orders of a suspended convention, and takes them once it is restored', async () => {
    const s = await shop()
    const placed = await s.place()
    await s.endHold(placed)

    await suspend(s.t.id)
    await expiry().run()
    expect(await s.stored(placed)).toMatchObject({ status: 'awaiting-payment' })

    await restore(s.t.id)
    await expiry().run()
    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
  })

  // Safe with several API processes: a row is claimed under a lock that the others skip.
  it('expires an order once when it runs twice at the same moment', async () => {
    const s = await shop()
    const placed = await s.place()
    await s.endHold(placed)

    await Promise.all([expiry().run(), expiry().run(), expiry().run()])

    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
    expect(await s.emails()).toEqual([['order-expired', 'buyer@example.test']])
  })

  it('does not expire an order that is not awaiting payment', async () => {
    const s = await shop()
    const placed = await s.place()
    await s.endHold(placed)

    for (const status of ['paid', 'needs-review', 'canceled', 'declined']) {
      await setColumn('orders', placed.orderId, 'status', status)
      await expiry().run()
      expect(await s.stored(placed)).toMatchObject({ status, holds: true })
    }
    expect(await s.emails()).toEqual([])
  })
})
