import { type NestExpressApplication } from '@nestjs/platform-express'
import {
  HOLD_MINUTES,
  type OrderResult,
  type PlacedOrder,
  RESULT_TOKEN_HEADER,
  type StartedAttempt,
} from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { STAND_IN_TOKEN } from '../src/modules/checkout/bot-check'
import {
  FAKE_ACCOUNT,
  fakeNotification,
  type FakeProvider,
} from '../src/modules/payments/fake-provider'
import { PROVIDER_MODULES } from '../src/modules/payments/payment-providers'
import { createApp } from './app'
import { createAccount, deleteCreatedAccounts, session } from './auth'
import {
  addEdition,
  addEditionAccess,
  addOrder,
  addOrg,
  addTicketType,
  closeTenantDb,
  connectFake,
  deleteCreatedTenants,
  makeShopReady,
  member,
  type Member,
  openShop,
  restore,
  setColumn,
  setPublished,
  storedRows,
  suspend,
  tenantWithHead,
} from './tenants'

// Paying for an order (docs/specs/0004-checkout-and-orders.md, Y1-Y14, R1-R5), against the fake
// provider: an order is paid only when its provider's module confirms the payment to the API.
// The buyer's return to the shop is never proof of payment.

let app: NestExpressApplication
const env = loadEnv()

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
const demo = { account: 'demo' }

/** The fake provider's own module: what a buyer does at the provider, a test does here. */
const fake = () => app.get<Map<string, FakeProvider>>(PROVIDER_MODULES).get('fake')!

/** A published edition with an open shop, a connected fake account and one ticket type. */
async function shop(account = 'demo', ticketType: Parameters<typeof addTicketType>[2] = {}) {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id)
  await setPublished(edition, true)
  await makeShopReady(t.id, edition)
  await connectFake(t.id, account)
  await openShop(t.id, edition)
  const standard = await addTicketType(t.id, edition, { name: 'Standard', ...ticketType })
  const editions = await request(app.getHttpServer()).get(`/public/tenants/${t.slug}/editions`)
  const slug = (editions.body as { slug: string }[])[0]!.slug
  /** Places a visitor's order for the ticket type and answers what the buyer's tab then holds. */
  const place = async (email = 'buyer@example.test', expectedTotalMinor = 10000) => {
    const res = await request(app.getHttpServer())
      .post(`/public/tenants/${t.slug}/editions/${slug}/shop/orders`)
      .send({
        cart: { ticket: { ticketTypeId: standard } },
        holderName: 'Ada Lovelace',
        ageBand: 'adult',
        email,
        emailConfirmation: email,
        providerConsentAccepted: true,
        expectedTotalMinor,
        botCheckToken: STAND_IN_TOKEN,
      })
      .expect(201)
    return res.body as PlacedOrder
  }
  const start = (order: PlacedOrder, token: string | null = order.resultToken) => {
    const req = request(app.getHttpServer()).post(
      `/public/tenants/${t.slug}/orders/${order.orderId}/payment-attempts`,
    )
    return token === null ? req : req.set(RESULT_TOKEN_HEADER, token)
  }
  const result = (order: PlacedOrder, token: string | null = order.resultToken) => {
    const req = request(app.getHttpServer()).get(
      `/public/tenants/${t.slug}/orders/${order.orderId}/result`,
    )
    return token === null ? req : req.set(RESULT_TOKEN_HEADER, token)
  }
  /** Starts an attempt and answers its identifier, which the provider's address ends with. */
  const started = async (order: PlacedOrder) => {
    const res = await start(order).expect(201)
    return (res.body as StartedAttempt).redirectUrl.split('/').pop()!
  }
  const order = async (id: string) =>
    (await storedRows('orders', t.id)).find((row) => row.id === id)!
  const attempts = () => storedRows('payment_attempts', t.id)
  const emails = async () =>
    (await storedRows('order_emails', t.id)).map((row) => [row.kind, row.recipient])
  return { t, edition, slug, standard, place, start, result, started, order, attempts, emails }
}

type Shop = Awaited<ReturnType<typeof shop>>

const notify = (attemptId: string, body: object, provider = 'fake') =>
  request(app.getHttpServer()).post(`/payments/${provider}/notifications/${attemptId}`).send(body)

const notifyMore = (attemptId: string, body: object) =>
  request(app.getHttpServer())
    .post(`/payments/fake/notifications/${attemptId}/additional`)
    .send(body)

/** The buyer pays at the fake provider, and the provider tells the API. */
const pay = (attemptId: string, payment: Parameters<FakeProvider['pay']>[1] = {}) =>
  notify(attemptId, fake().pay(attemptId, payment))

describe('a payment attempt', () => {
  it('starts at the provider with the order’s total and number, and nothing of the buyer', async () => {
    const s = await shop()
    const placed = await s.place()

    const res = await s.start(placed).expect(201)

    const { redirectUrl } = res.body as StartedAttempt
    const [attempt] = await s.attempts()
    const attemptId = String(attempt!.id)
    const payments = `${env.API_URL.replace(/\/$/, '')}/payments/fake`
    expect(redirectUrl).toBe(`${payments}/pay/${attemptId}`)
    expect(attempt).toMatchObject({
      order_id: placed.orderId,
      provider: 'fake',
      status: 'started',
      amount_minor: placed.totalMinor,
      paid_amount_minor: null,
      confirmed_at: null,
    })
    const sent = fake().started(attemptId)!
    expect(sent).toMatchObject({
      amountMinor: 10000,
      currency: 'PLN',
      reference: placed.number,
      email: 'buyer@example.test',
      notificationUrl: `${payments}/notifications/${attemptId}`,
      additionalNotificationUrl: `${payments}/notifications/${attemptId}/additional`,
    })
    // What the buyer reads at the provider carries no personal data.
    expect(sent.description).toContain(placed.number)
    expect(sent.description).not.toMatch(/Ada|buyer@/)
    // The buyer returns to the portal's result page, which opens with the result token.
    const back = new URL(sent.returnUrl)
    expect(back.origin).toBe(new URL(env.PORTAL_URL).origin)
    expect(back.pathname).toBe(`/conventions/${s.t.slug}/${s.slug}/shop/result/${placed.orderId}`)
    expect(back.searchParams.get('token')).toBe(placed.resultToken)
    // Starting an attempt pays nothing.
    expect(await s.order(placed.orderId)).toMatchObject({ status: 'awaiting-payment' })
  })

  it('opens with the result token of its order alone', async () => {
    const s = await shop()
    const [placed, other] = [await s.place(), await s.place('other@example.test')]

    await s.start(placed, null).expect(400)
    await s.start(placed, 'not-the-token').expect(404)
    await s.start(placed, other.resultToken).expect(404)
    await request(app.getHttpServer())
      .post(`/public/tenants/${s.t.slug}/orders/not-an-order/payment-attempts`)
      .set(RESULT_TOKEN_HEADER, placed.resultToken)
      .expect(404)
    // The token opens the order for 24 hours from its placing.
    await setColumn('orders', placed.orderId, 'placed_at', ago(24 * 60 + 1))
    await s.start(placed).expect(404)
    expect(await s.attempts()).toEqual([])
  })

  it('starts only within the hold of an order that awaits payment', async () => {
    const s = await shop()
    const placed = await s.place()

    await setColumn('orders', placed.orderId, 'hold_ends_at', ago(1))
    const late = await s.start(placed).expect(409)
    expect(late.body).toMatchObject({ code: 'order.hold-ended' })

    for (const [status, code] of [
      ['expired', 'order.hold-ended'],
      ['paid', 'order.already-paid'],
      ['needs-review', 'order.already-paid'],
      ['canceled', 'order.already-paid'],
      ['declined', 'order.already-paid'],
    ]) {
      await setColumn('orders', placed.orderId, 'status', status)
      const res = await s.start(placed).expect(409)
      expect(res.body).toMatchObject({ code })
    }
    expect(await s.attempts()).toEqual([])
  })

  it('finds the provider out of reach, and leaves the order as it was', async () => {
    const s = await shop(FAKE_ACCOUNT.startUnavailable)
    const placed = await s.place()

    const res = await s.start(placed).expect(503)

    expect(res.body).toMatchObject({ code: 'provider.unavailable' })
    // The attempt is kept as one that ended with no payment.
    expect(await s.attempts()).toMatchObject([{ status: 'ended' }])
    expect(await s.order(placed.orderId)).toMatchObject({ status: 'awaiting-payment', holds: true })
  })

  it('starts again while none was paid: the buyer tries again without entering anything anew', async () => {
    const s = await shop()
    const placed = await s.place()

    const first = await s.started(placed)
    const second = await s.started(placed)

    expect(second).not.toBe(first)
    expect(await s.attempts()).toMatchObject([{ status: 'started' }, { status: 'started' }])
  })

  // Before a new attempt starts, the module is asked about the earlier ones (Y3).
  it('does not start when an earlier one was paid: that payment is confirmed instead', async () => {
    const s = await shop()
    const placed = await s.place()
    const first = await s.started(placed)
    // Paid at the provider, and the notification never came.
    fake().pay(first)

    const res = await s.start(placed).expect(409)

    expect(res.body).toMatchObject({ code: 'order.already-paid' })
    expect(await s.attempts()).toMatchObject([{ id: first, status: 'paid' }])
    expect(await s.order(placed.orderId)).toMatchObject({ status: 'paid' })
  })

  it('is not started for a suspended convention or an unpublished edition', async () => {
    const s = await shop()
    const placed = await s.place()

    await setPublished(s.edition, false)
    await s.start(placed).expect(404)
    await s.result(placed).expect(404)
    await setPublished(s.edition, true)
    await suspend(s.t.id)
    await s.start(placed).expect(404)
    await s.result(placed).expect(404)
    await restore(s.t.id)
    expect(await s.attempts()).toEqual([])
  })
})

describe('a payment attempt of an account', () => {
  const placeAs = async (s: Shop, who: Member) => {
    const res = await request(app.getHttpServer())
      .post(`/editions/${s.edition}/shop/orders`)
      .use(session(who.token))
      .set('X-Tenant-Slug', s.t.slug)
      .send({
        cart: { ticket: { ticketTypeId: s.standard } },
        holderName: 'Ada',
        ageBand: 'adult',
        providerConsentAccepted: true,
        expectedTotalMinor: 10000,
        botCheckToken: STAND_IN_TOKEN,
      })
      .expect(201)
    return res.body as PlacedOrder
  }
  const startAs = (s: Shop, who: Member | undefined, orderId: string, edition = s.edition) => {
    const req = request(app.getHttpServer())
      .post(`/editions/${edition}/orders/${orderId}/payment-attempts`)
      .set('X-Tenant-Slug', s.t.slug)
    return who ? req.use(session(who.token)) : req
  }

  it('starts for the account’s own order, with no place in the team and no token', async () => {
    const s = await shop()
    const buyer = await member()
    const placed = await placeAs(s, buyer)

    const res = await startAs(s, buyer, placed.orderId).expect(201)

    const [attempt] = await s.attempts()
    expect((res.body as StartedAttempt).redirectUrl).toContain(String(attempt!.id))
    // The tab holds the token; the address the buyer returns to carries it when the tab sent it.
    expect(new URL(fake().started(String(attempt!.id))!.returnUrl).searchParams.has('token')).toBe(
      false,
    )
    const again = await startAs(s, buyer, placed.orderId)
      .set(RESULT_TOKEN_HEADER, placed.resultToken)
      .expect(201)
    const second = (again.body as StartedAttempt).redirectUrl.split('/').pop()!
    expect(new URL(fake().started(second)!.returnUrl).searchParams.get('token')).toBe(
      placed.resultToken,
    )
  })

  it('finds no order of another account, of a visitor or of another edition', async () => {
    const s = await shop()
    const [buyer, other] = [await member(), await member()]
    const placed = await placeAs(s, buyer)
    const visitors = await s.place()
    const elsewhere = await addEdition(s.t.id, { isPublished: true })

    await startAs(s, other, placed.orderId).expect(404)
    await startAs(s, buyer, visitors.orderId).expect(404)
    await startAs(s, buyer, placed.orderId, elsewhere).expect(404)
    await startAs(s, buyer, 'not-an-order').expect(404)
    await startAs(s, undefined, placed.orderId).expect(401)
    expect(await s.attempts()).toEqual([])
  })

  it('is refused as a visitor’s is', async () => {
    const s = await shop()
    const buyer = await member()
    const placed = await placeAs(s, buyer)

    await setColumn('orders', placed.orderId, 'hold_ends_at', ago(1))
    const res = await startAs(s, buyer, placed.orderId).expect(409)

    expect(res.body).toMatchObject({ code: 'order.hold-ended' })
  })
})

describe('a payment the provider confirms', () => {
  it('makes the order paid: its QR code, its confirmation once, and the attempt keeps the payment', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const at = new Date(Date.now() - 5000)

    await pay(attemptId, { at }).expect(200)

    const order = await s.order(placed.orderId)
    expect(order).toMatchObject({ status: 'paid', holds: true, hold_ends_at: null })
    expect(order.paid_at).not.toBeNull()
    const [attempt] = await s.attempts()
    expect(attempt).toMatchObject({
      status: 'paid',
      amount_minor: 10000,
      paid_amount_minor: 10000,
      money_with: 'convention',
      information: { transaction: attempt!.provider_reference },
    })
    expect(String(attempt!.provider_reference)).toMatch(/^FAKE-/)
    expect(new Date(String(attempt!.paid_at)).getTime()).toBe(at.getTime())
    expect(attempt!.confirmed_at).not.toBeNull()
    expect(await storedRows('order_qr_codes', s.t.id)).toHaveLength(1)
    expect(await s.emails()).toEqual([['order-confirmation', 'buyer@example.test']])
  })

  it('changes nothing when it is repeated', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const body = fake().pay(attemptId)

    await notify(attemptId, body).expect(200)
    const before = [await s.order(placed.orderId), await s.attempts()]
    await notify(attemptId, body).expect(200)
    await notify(attemptId, body).expect(200)

    expect([await s.order(placed.orderId), await s.attempts()]).toEqual(before)
    expect(await storedRows('order_qr_codes', s.t.id)).toHaveLength(1)
    expect(await s.emails()).toHaveLength(1)
  })

  it('counts only once its signature holds: anything else is an unknown address', async () => {
    const s = await shop()
    const other = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const theirs = await other.started(await other.place())
    const body = fake().pay(attemptId)

    for (const forged of [
      { ...body, amountMinor: 1 },
      { ...body, signature: 'zz' },
      // Signed by another account, and the notification of another convention's attempt.
      fakeNotification({ account: 'other' }, body),
      fake().pay(theirs),
      {},
    ]) {
      await notify(attemptId, forged).expect(404)
    }
    await notify('0198c1a0-0000-7000-8000-000000000001', body).expect(404)
    await notify('not-an-attempt', body).expect(404)
    await notify(attemptId, body, 'przelewy24').expect(404)
    await notify(attemptId, body, 'unknown').expect(404)
    // A payment is not reported on the address of the additional notifications.
    await notifyMore(attemptId, body).expect(404)

    expect(await s.order(placed.orderId)).toMatchObject({ status: 'awaiting-payment' })
    expect(await s.attempts()).toMatchObject([{ status: 'started', confirmed_at: null }])
  })

  // A suspended tenant takes no payment: the notification is refused, and taken when the
  // provider repeats it after a restoration.
  it('is refused for a suspended convention, and taken once it is restored', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const body = fake().pay(attemptId)

    await suspend(s.t.id)
    await notify(attemptId, body).expect(404)
    expect(await s.order(placed.orderId)).toMatchObject({ status: 'awaiting-payment' })
    await restore(s.t.id)
    await notify(attemptId, body).expect(200)
    expect(await s.order(placed.orderId)).toMatchObject({ status: 'paid' })
  })

  it('attaches a visitor’s order to the account whose confirmed email it was paid under', async () => {
    const s = await shop()
    const known = await createAccount()
    const unconfirmed = await createAccount({}, { confirmed: false })
    const [theirs, nobodys] = [await s.place(known.email), await s.place(unconfirmed.email)]

    // Not while it is unpaid: an order under an email proves nothing of who placed it.
    expect(await storedRows('order_accounts', s.t.id)).toEqual([])
    await pay(await s.started(theirs)).expect(200)
    await pay(await s.started(nobodys)).expect(200)

    expect(await storedRows('order_accounts', s.t.id)).toMatchObject([
      { order_id: theirs.orderId, account_id: known.id },
    ])
  })

  it('is taken again when the provider’s process could not be finished', async () => {
    const s = await shop(FAKE_ACCOUNT.settleUnavailable)
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const body = fake().pay(attemptId)

    const res = await notify(attemptId, body).expect(503)

    // Nothing is paid until the provider's process is finished.
    expect(res.body).toMatchObject({ code: 'provider.unavailable' })
    expect(await s.order(placed.orderId)).toMatchObject({ status: 'awaiting-payment' })
    expect(await s.attempts()).toMatchObject([{ status: 'started', confirmed_at: null }])
    expect(await s.emails()).toEqual([])

    // The provider repeats its notification, and this time it answers.
    await connectFake(s.t.id, 'demo')
    await notify(attemptId, fakeNotification(demo, body)).expect(200)
    expect(await s.order(placed.orderId)).toMatchObject({ status: 'paid' })
  })

  it('made after the hold still pays an order that was not expired yet', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    await setColumn('orders', placed.orderId, 'hold_ends_at', ago(5))

    await pay(attemptId).expect(200)

    expect(await s.order(placed.orderId)).toMatchObject({ status: 'paid', holds: true })
  })
})

describe('a payment that does not match its order', () => {
  /** A head, an org who writes the edition's tickets, and one who does not: who is alerted. */
  async function orgs(s: Shop) {
    const [writer, reader] = [await member(), await member()]
    const writes = await addOrg(s.t.id, writer)
    await addEditionAccess(s.t.id, writes, s.edition, { tickets: 'write' })
    const reads = await addOrg(s.t.id, reader, { shop: 'write' })
    await addEditionAccess(s.t.id, reads, s.edition, { tickets: 'read' })
    return [s.t.head.email, writer.email].map((email) => email.toLowerCase()).sort()
  }
  const sentTo = async (s: Shop, kind: string) =>
    (await s.emails())
      .filter(([sent]) => sent === kind)
      .map(([, recipient]) => String(recipient))
      .sort()

  it('of another amount never pays it: the order needs review, and its orgs and buyer are told', async () => {
    const s = await shop()
    const alerted = await orgs(s)
    const placed = await s.place()
    const attemptId = await s.started(placed)

    await pay(attemptId, { amountMinor: 9000 }).expect(200)

    // It keeps what it still holds until an org settles it.
    expect(await s.order(placed.orderId)).toMatchObject({
      status: 'needs-review',
      holds: true,
      paid_at: null,
    })
    // The provider's process was finished: the money is with the convention.
    expect(await s.attempts()).toMatchObject([
      { status: 'paid', amount_minor: 10000, paid_amount_minor: 9000, money_with: 'convention' },
    ])
    expect(await storedRows('order_qr_codes', s.t.id)).toEqual([])
    expect(await sentTo(s, 'payment-under-review')).toEqual(['buyer@example.test'])
    expect(await sentTo(s, 'needs-review')).toEqual(alerted)
    expect(await s.emails()).toHaveLength(1 + alerted.length)

    // A repeat changes nothing, and tells nobody again.
    await pay(attemptId, { amountMinor: 9000 }).expect(200)
    expect(await s.emails()).toHaveLength(1 + alerted.length)
  })

  it('for an expired order pays it while what it held is still there, taking it again', async () => {
    const s = await shop('demo', { capacity: 1 })
    const placed = await s.place()
    const attemptId = await s.started(placed)
    await setColumn('orders', placed.orderId, 'status', 'expired')
    await setColumn('orders', placed.orderId, 'holds', false)

    await pay(attemptId).expect(200)

    expect(await s.order(placed.orderId)).toMatchObject({ status: 'paid', holds: true })
    expect(await s.emails()).toEqual([['order-confirmation', 'buyer@example.test']])
  })

  it('for an expired order whose ticket is gone sends it to review, and takes nothing', async () => {
    const s = await shop('demo', { capacity: 1 })
    const alerted = await orgs(s)
    const placed = await s.place()
    const attemptId = await s.started(placed)
    await setColumn('orders', placed.orderId, 'status', 'expired')
    await setColumn('orders', placed.orderId, 'holds', false)
    // The last ticket went to another order meanwhile.
    await addOrder(s.t.id, s.edition, { ticketTypeId: s.standard, email: 'other@example.test' })

    await pay(attemptId).expect(200)

    expect(await s.order(placed.orderId)).toMatchObject({ status: 'needs-review', holds: false })
    expect(await s.attempts()).toMatchObject([{ status: 'paid', money_with: 'convention' }])
    expect(await sentTo(s, 'payment-under-review')).toEqual(['buyer@example.test'])
    expect(await sentTo(s, 'needs-review')).toEqual(alerted)
  })

  it.each(['paid', 'needs-review', 'canceled', 'declined'])(
    'for an order already %s changes nothing of it and is refused: the money stays with the buyer',
    async (status) => {
      const s = await shop()
      await orgs(s)
      const placed = await s.place()
      const attemptId = await s.started(placed)
      await setColumn('orders', placed.orderId, 'status', status)
      const before = await s.order(placed.orderId)

      await pay(attemptId).expect(200)

      expect(await s.order(placed.orderId)).toEqual(before)
      // Refused or not, it is kept with its attempt and shown on the order.
      expect(await s.attempts()).toMatchObject([
        { status: 'refused', paid_amount_minor: 10000, money_with: 'buyer' },
      ])
      expect(await storedRows('order_qr_codes', s.t.id)).toEqual([])
      // The buyer is told where the money is; the orgs have nothing to do.
      expect(await s.emails()).toEqual([['payment-not-needed', 'buyer@example.test']])
      await pay(attemptId).expect(200)
      expect(await s.emails()).toHaveLength(1)
    },
  )

  it('that could not be refused stays with the convention, and its orgs are alerted', async () => {
    const s = await shop(FAKE_ACCOUNT.cannotRefuse)
    const alerted = await orgs(s)
    const placed = await s.place()
    const [first, second] = [await s.started(placed), await s.started(placed)]

    // Two attempts of one order are both paid: the second is a payment the order no longer needs.
    await pay(first).expect(200)
    await pay(second).expect(200)

    expect(await s.order(placed.orderId)).toMatchObject({ status: 'paid' })
    expect(await s.attempts()).toMatchObject([
      { id: first, status: 'paid', money_with: 'convention' },
      { id: second, status: 'paid', money_with: 'convention' },
    ])
    expect(await storedRows('order_qr_codes', s.t.id)).toHaveLength(1)
    expect(await sentTo(s, 'order-confirmation')).toEqual(['buyer@example.test'])
    expect(await sentTo(s, 'payment-not-needed')).toEqual(['buyer@example.test'])
    expect(await sentTo(s, 'payment-not-needed-orgs')).toEqual(alerted)
  })
})

describe('a failure the provider reports', () => {
  it('fails the attempt and leaves the order awaiting payment, with the provider’s own code kept', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)

    await notifyMore(attemptId, fake().fail(attemptId, 'no-funds')).expect(200)

    expect(await s.attempts()).toMatchObject([
      {
        status: 'failed',
        failure_reason: 'insufficient-funds',
        failure_code: 'no-funds',
        paid_amount_minor: null,
      },
    ])
    expect(await s.order(placed.orderId)).toMatchObject({ status: 'awaiting-payment', holds: true })
    // The buyer reads why, as one of the shop's own short list, and tries again.
    expect((await s.result(placed).expect(200)).body).toMatchObject({
      status: 'awaiting-payment',
      failureReason: 'insufficient-funds',
    })
    await s.started(placed)
    expect((await s.result(placed).expect(200)).body).toMatchObject({ failureReason: null })
  })

  it('reads a code the module does not know as the general failure', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)

    await notifyMore(attemptId, fake().fail(attemptId, 'E-4012')).expect(200)

    expect(await s.attempts()).toMatchObject([{ failure_reason: 'failed', failure_code: 'E-4012' }])
    expect((await s.result(placed).expect(200)).body).toMatchObject({ failureReason: 'failed' })
  })

  it('counts only once its signature holds, and only on the additional address', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const body = fake().fail(attemptId, 'canceled')

    await notifyMore(attemptId, { ...body, code: 'no-funds' }).expect(404)
    await notify(attemptId, body).expect(404)

    expect(await s.attempts()).toMatchObject([{ status: 'started', failure_reason: null }])
  })

  // A failure does not close the attempt: a payment confirmed for it later still counts.
  it('does not close the attempt: a payment confirmed for it afterwards still pays the order', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    await notifyMore(attemptId, fake().fail(attemptId, 'timed-out')).expect(200)

    await pay(attemptId).expect(200)

    expect(await s.order(placed.orderId)).toMatchObject({ status: 'paid' })
    expect(await s.attempts()).toMatchObject([{ status: 'paid', money_with: 'convention' }])
    // And a failure reported after the payment changes nothing.
    await notifyMore(attemptId, fake().fail(attemptId, 'canceled')).expect(200)
    expect(await s.attempts()).toMatchObject([{ status: 'paid' }])
  })
})

describe('the result of an order', () => {
  const body = async (s: Shop, placed: PlacedOrder) =>
    (await s.result(placed).expect(200)).body as OrderResult

  it('is its status and number alone, with when its hold ends while it awaits payment', async () => {
    const s = await shop()
    const placed = await s.place()

    const awaiting = await body(s, placed)

    expect(awaiting).toEqual({
      number: placed.number,
      status: 'awaiting-payment',
      holdEndsAt: expect.any(String) as string,
      failureReason: null,
      moneyWith: null,
      editionSlug: s.slug,
    })
    const holdEnds = new Date(awaiting.holdEndsAt!).getTime()
    expect(holdEnds).toBeGreaterThan(Date.now() + (HOLD_MINUTES - 1) * MINUTE)
    // No personal data: nothing of the buyer or the ticket holder.
    expect(JSON.stringify(awaiting)).not.toMatch(/buyer@|Ada/)
  })

  it('says paid only once the provider confirmed: the buyer’s return proves nothing', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)

    expect(await body(s, placed)).toMatchObject({ status: 'awaiting-payment' })
    await pay(attemptId).expect(200)

    expect(await body(s, placed)).toMatchObject({
      status: 'paid',
      holdEndsAt: null,
      failureReason: null,
      moneyWith: null,
    })
  })

  it('says where the money is for an order that needs review, as the provider words it', async () => {
    const s = await shop()
    const placed = await s.place()
    await pay(await s.started(placed), { amountMinor: 1 }).expect(200)

    expect(await body(s, placed)).toMatchObject({
      status: 'needs-review',
      moneyWith: fake().moneyWith('convention'),
    })
  })

  it('says expired once the hold ended with no payment', async () => {
    const s = await shop()
    const placed = await s.place()
    await setColumn('orders', placed.orderId, 'status', 'expired')

    expect(await body(s, placed)).toMatchObject({ status: 'expired', editionSlug: s.slug })
  })

  it('opens with the result token alone, for 24 hours from the order’s placing', async () => {
    const s = await shop()
    const [placed, other] = [await s.place(), await s.place('other@example.test')]

    await s.result(placed, null).expect(400)
    await s.result(placed, 'not-the-token').expect(404)
    await s.result(placed, other.resultToken).expect(404)
    await setColumn('orders', placed.orderId, 'placed_at', ago(24 * 60 - 1))
    await s.result(placed).expect(200)
    await setColumn('orders', placed.orderId, 'placed_at', ago(24 * 60 + 1))
    await s.result(placed).expect(404)
  })

  // The total is equal wherever it is shown: in the quote, the order and the attempt.
  it('rests on one total from the quote to the attempt', async () => {
    const s = await shop()
    const quote = await request(app.getHttpServer())
      .post(`/public/tenants/${s.t.slug}/editions/${s.slug}/shop/quote`)
      .send({ ticket: { ticketTypeId: s.standard } })
      .expect(200)
    const placed = await s.place()
    await s.started(placed)

    const total = (quote.body as { totalMinor: number }).totalMinor
    expect(placed.totalMinor).toBe(total)
    expect(await s.order(placed.orderId)).toMatchObject({ total_minor: total })
    expect(await s.attempts()).toMatchObject([{ amount_minor: total }])
  })
})

describe('the pay page of the fake provider', () => {
  const page = (path: string) => request(app.getHttpServer()).get(`/payments/fake/pay/${path}`)

  it('shows what is paid and what the buyer can make of it, and nothing of the buyer', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)

    const res = await page(attemptId).expect(200)

    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.text).toContain(placed.number)
    for (const outcome of ['paid', 'card-declined', 'no-funds', 'wrong-code', 'canceled']) {
      expect(res.text).toContain(`href="${attemptId}/${outcome}"`)
    }
    expect(res.text).not.toMatch(/buyer@|Ada/)
  })

  it('sends the buyer back to the shop once the provider was told what happened', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)

    const res = await page(`${attemptId}/canceled`).expect(303)

    expect(res.headers.location).toBe(fake().started(attemptId)!.returnUrl)
  })

  it('is an unknown address for an attempt the provider did not start', async () => {
    const s = await shop()
    const attemptId = await s.started(await s.place())

    await page('0198c1a0-0000-7000-8000-000000000001').expect(404)
    await page('0198c1a0-0000-7000-8000-000000000001/paid').expect(404)
    await page(`${attemptId}/free`).expect(404)
  })
})
