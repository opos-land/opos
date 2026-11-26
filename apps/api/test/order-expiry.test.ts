import { type NestExpressApplication } from '@nestjs/platform-express'
import { type PlacedOrder, RESULT_TOKEN_HEADER, type StartedAttempt } from '@opos/contract'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { STAND_IN_TOKEN } from '../src/modules/checkout/bot-check'
import { OrderExpiry } from '../src/modules/checkout/order-expiry.service'
import { FAKE_ACCOUNT, type FakeProvider } from '../src/modules/payments/fake-provider'
import { CredentialsVault, PROVIDER_MODULES } from '../src/modules/payments/payment-providers'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import {
  addEdition,
  addTicketType,
  closeTenantDb,
  connectAccount,
  connectFake,
  deleteCreatedTenants,
  loseCredentials,
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

afterEach(() => {
  vi.restoreAllMocks()
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
/** The job for one tenant alone: other tests place orders of their own beside this one. */
const expire = (s: { t: { id: string } }) =>
  app.get(OrderExpiry).run(new Date(), { tenantId: s.t.id })

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

    await expire(s)

    expect(await s.stored(late)).toMatchObject({ status: 'expired', holds: false, paid_at: null })
    // An attempt nobody paid ended with it.
    expect(await s.attempts()).toMatchObject([{ id: attemptId, status: 'ended' }])
    expect(await s.emails()).toEqual([['order-expired', 'buyer@example.test']])
    // An order within its hold is left as it is.
    expect(await s.stored(fresh)).toMatchObject({ status: 'awaiting-payment', holds: true })

    // Once expired, it is not expired again.
    await expire(s)
    expect(await s.emails()).toHaveLength(1)
  })

  it('expires an order no attempt was ever started for', async () => {
    const s = await shop()
    const placed = await s.place()
    await s.endHold(placed)

    await expire(s)

    expect(await s.stored(placed)).toMatchObject({ status: 'expired', holds: false })
  })

  it('releases what the order held: the last ticket is on sale again', async () => {
    const s = await shop('demo', 1)
    const placed = await s.place()
    await s.order('next@example.test').expect(409)
    await s.endHold(placed)

    await expire(s)

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

    await expire(s)

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

    await expire(s)

    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
    expect(await s.attempts()).toMatchObject([{ status: 'failed', failure_reason: 'canceled' }])
  })

  // Whether a payment was made is not known: the order waits for the provider to answer.
  it('leaves an order as it is while its provider is out of reach', async () => {
    const s = await shop(FAKE_ACCOUNT.stateUnavailable)
    const placed = await s.place()
    await s.started(placed)
    await s.endHold(placed)

    await expire(s)

    expect(await s.stored(placed)).toMatchObject({ status: 'awaiting-payment', holds: true })
    expect(await s.emails()).toEqual([])

    await connectFake(s.t.id, 'demo')
    await expire(s)
    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
  })

  // The job reads a page at a time, each after the last order of the one before: an order left
  // to wait at the head holds no other order back.
  it('expires an order behind one that has to wait', async () => {
    const s = await shop(FAKE_ACCOUNT.stateUnavailable)
    const [waiting, behind] = [await s.place(), await s.place('other@example.test')]
    await s.started(waiting)
    await setColumn('orders', waiting.orderId, 'hold_ends_at', ago(10))
    await s.endHold(behind)

    const result = await app.get(OrderExpiry).run(new Date(), { tenantId: s.t.id, limit: 1 })

    expect(result).toEqual({ expired: 1, paid: 0, waiting: 1 })
    expect(await s.stored(waiting)).toMatchObject({ status: 'awaiting-payment' })
    expect(await s.stored(behind)).toMatchObject({ status: 'expired' })
  })

  it('passes by the orders of a suspended convention, and takes them once it is restored', async () => {
    const s = await shop()
    const placed = await s.place()
    await s.endHold(placed)

    await suspend(s.t.id)
    await expire(s)
    expect(await s.stored(placed)).toMatchObject({ status: 'awaiting-payment' })

    await restore(s.t.id)
    await expire(s)
    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
  })

  // Safe with several API processes: a row is claimed under a lock that the others skip.
  it('expires an order once when it runs twice at the same moment', async () => {
    const s = await shop()
    const placed = await s.place()
    await s.endHold(placed)

    await Promise.all([expire(s), expire(s), expire(s)])

    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
    expect(await s.emails()).toEqual([['order-expired', 'buyer@example.test']])
  })

  it('does not expire an order that is not awaiting payment', async () => {
    const s = await shop()
    const placed = await s.place()
    await s.endHold(placed)

    for (const status of ['paid', 'needs-review', 'canceled', 'declined']) {
      await setColumn('orders', placed.orderId, 'status', status)
      await expire(s)
      expect(await s.stored(placed)).toMatchObject({ status, holds: true })
    }
    expect(await s.emails()).toEqual([])
  })
})

// A payment its provider settled may leave no trace when the answer is lost on its way and the
// provider repeats nothing: for an order that expired nothing else would find it. Each attempt of
// an expired order nobody confirmed is asked about at its provider once more, an hour after the
// hold ended, and a payment found is taken as any late one is.
describe('asking again about the attempts of an expired order', () => {
  const HOUR = 60
  const recheck = (s: { t: { id: string } }, limit?: number) =>
    app.get(OrderExpiry).recheck(new Date(), { tenantId: s.t.id, limit })
  type Shop = Awaited<ReturnType<typeof shop>>

  /** An order that expired with an attempt nobody paid, its hold ended `minutes` ago. */
  async function expired(s: Shop, { minutes = HOUR + 1, email = 'buyer@example.test' } = {}) {
    const placed = await s.place(email)
    const attemptId = await s.started(placed)
    await s.endHold(placed)
    await expire(s)
    await setColumn('orders', placed.orderId, 'hold_ends_at', ago(minutes))
    return { placed, attemptId }
  }
  const attempt = async (s: Shop, id: string) => (await s.attempts()).find((row) => row.id === id)!

  it('takes a payment found at the provider an hour after the hold ended: the order is paid', async () => {
    const s = await shop()
    const { placed, attemptId } = await expired(s)
    // Paid at the provider, whose notification left no trace.
    fake().pay(attemptId)

    expect(await recheck(s)).toEqual({ taken: 1, unpaid: 0, waiting: 0 })

    expect(await s.stored(placed)).toMatchObject({ status: 'paid', holds: true })
    const stored = await attempt(s, attemptId)
    expect(stored).toMatchObject({
      status: 'paid',
      paid_amount_minor: 10000,
      money_with: 'convention',
    })
    expect(stored.provider_reference).toMatch(/^FAKE-/)
    expect(stored.confirmed_at).not.toBeNull()
    expect(stored.rechecked_at).not.toBeNull()
    expect(await s.emails()).toContainEqual(['order-confirmation', 'buyer@example.test'])
  })

  it('sends the order to review when what it held is gone meanwhile', async () => {
    const s = await shop('demo', 1)
    const { placed, attemptId } = await expired(s)
    await s.place('next@example.test')
    fake().pay(attemptId)

    expect(await recheck(s)).toEqual({ taken: 1, unpaid: 0, waiting: 0 })

    expect(await s.stored(placed)).toMatchObject({
      status: 'needs-review',
      review_cause: 'unavailable',
      holds: false,
    })
    expect(await attempt(s, attemptId)).toMatchObject({ status: 'paid', money_with: 'convention' })
    expect(await s.emails()).toContainEqual(['payment-under-review', 'buyer@example.test'])
  })

  it('asks once: an attempt found unpaid is marked and not asked about again', async () => {
    const s = await shop()
    const { placed, attemptId } = await expired(s)

    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 1, waiting: 0 })
    const stored = await attempt(s, attemptId)
    expect(stored).toMatchObject({ status: 'ended', confirmed_at: null })
    expect(stored.rechecked_at).not.toBeNull()

    // What the provider would say now is not asked for.
    fake().pay(attemptId)
    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 0, waiting: 0 })
    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
  })

  it('asks about no attempt within the first hour after the hold ended', async () => {
    const s = await shop()
    const { placed, attemptId } = await expired(s, { minutes: HOUR - 5 })
    fake().pay(attemptId)

    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 0, waiting: 0 })

    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
    expect(await attempt(s, attemptId)).toMatchObject({ rechecked_at: null })
  })

  it('leaves an attempt whose provider is out of reach for the next run, for 24 hours at most', async () => {
    const s = await shop()
    const { placed, attemptId } = await expired(s)
    fake().pay(attemptId)
    await connectFake(s.t.id, FAKE_ACCOUNT.stateUnavailable)

    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 0, waiting: 1 })
    expect(await attempt(s, attemptId)).toMatchObject({ rechecked_at: null })

    // A day after the hold ended nobody asks any more.
    await setColumn('orders', placed.orderId, 'hold_ends_at', ago(24 * HOUR + 1))
    await connectFake(s.t.id, 'demo')
    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 0, waiting: 0 })
    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })

    // Within the day the next run finds the provider back.
    await setColumn('orders', placed.orderId, 'hold_ends_at', ago(23 * HOUR))
    expect(await recheck(s)).toEqual({ taken: 1, unpaid: 0, waiting: 0 })
    expect(await s.stored(placed)).toMatchObject({ status: 'paid' })
  })

  // A provider that did not answer twice in a row about the attempts of a convention is asked
  // about no other of them in that run: each question it does not answer takes its time, and it
  // limits its API.
  it('asks a provider out of reach twice a run, and leaves the convention’s other attempts unasked', async () => {
    const s = await shop()
    const first = await expired(s, { minutes: 3 * HOUR })
    const second = await expired(s, { minutes: 2 * HOUR, email: 'second@example.test' })
    const third = await expired(s, { email: 'other@example.test' })
    fake().pay(third.attemptId)
    await connectFake(s.t.id, FAKE_ACCOUNT.stateUnavailable)
    const state = vi.spyOn(fake(), 'state')

    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 0, waiting: 3 })

    expect(state).toHaveBeenCalledTimes(2)
    for (const { attemptId } of [first, second, third]) {
      expect(await attempt(s, attemptId)).toMatchObject({ rechecked_at: null })
    }

    // The next run finds the provider back, and asks about each.
    await connectFake(s.t.id, 'demo')
    expect(await recheck(s)).toEqual({ taken: 1, unpaid: 2, waiting: 0 })
    expect(state).toHaveBeenCalledTimes(5)
  })

  // One answer that cannot be read may be of that attempt alone: the convention's next attempt
  // is asked about in the same run.
  it('asks about the next attempt of a convention after one answer that could not be read', async () => {
    const s = await shop()
    const unreadable = await expired(s, { minutes: 3 * HOUR })
    const next = await expired(s, { email: 'other@example.test' })
    fake().pay(next.attemptId)
    const state = vi.spyOn(fake(), 'state')
    state.mockImplementationOnce(() =>
      Promise.resolve({ state: 'unavailable', reason: 'an answer that cannot be read' }),
    )

    expect(await recheck(s)).toEqual({ taken: 1, unpaid: 0, waiting: 1 })

    expect(state).toHaveBeenCalledTimes(2)
    expect(await attempt(s, unreadable.attemptId)).toMatchObject({ rechecked_at: null })
    expect(await s.stored(next.placed)).toMatchObject({ status: 'paid' })
  })

  it('tries credentials that no longer open once a run, and asks nobody', async () => {
    const s = await shop()
    await expired(s, { minutes: 3 * HOUR })
    await expired(s, { email: 'other@example.test' })
    await loseCredentials(s.t.id)
    const state = vi.spyOn(fake(), 'state')
    const open = vi.spyOn(app.get(CredentialsVault), 'open')

    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 0, waiting: 2 })

    expect(open).toHaveBeenCalledTimes(1)
    expect(state).not.toHaveBeenCalled()
  })

  // The providers are asked from one address for every convention: a run asks so many questions
  // and leaves the attempts after them to the next one.
  it('asks no more questions than a run may, and takes the rest in the next run', async () => {
    const s = await shop()
    const first = await expired(s, { minutes: 3 * HOUR })
    const second = await expired(s, { email: 'other@example.test' })

    const one = await app.get(OrderExpiry).recheck(new Date(), { tenantId: s.t.id, questions: 1 })

    expect(one).toEqual({ taken: 0, unpaid: 1, waiting: 0 })
    expect((await attempt(s, first.attemptId)).rechecked_at).not.toBeNull()
    expect(await attempt(s, second.attemptId)).toMatchObject({ rechecked_at: null })

    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 1, waiting: 0 })
    expect((await attempt(s, second.attemptId)).rechecked_at).not.toBeNull()
  })

  // The provider counts the payment as made, and settling it does not answer: nothing is written,
  // and the attempt stays to ask about.
  it('leaves an attempt whose payment could not be settled for the next run', async () => {
    const s = await shop()
    const { placed, attemptId } = await expired(s)
    fake().pay(attemptId)
    await connectFake(s.t.id, FAKE_ACCOUNT.settleUnavailable)

    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 0, waiting: 1 })
    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
    expect(await attempt(s, attemptId)).toMatchObject({ confirmed_at: null, rechecked_at: null })

    await connectFake(s.t.id, 'demo')
    expect(await recheck(s)).toEqual({ taken: 1, unpaid: 0, waiting: 0 })
    expect(await s.stored(placed)).toMatchObject({ status: 'paid' })
  })

  // The job reads a page at a time, each after the last attempt of the one before.
  it('asks about an attempt behind one that has to wait', async () => {
    const s = await shop()
    const waiting = await expired(s, { minutes: 3 * HOUR })
    const behind = await expired(s, { email: 'other@example.test' })
    fake().pay(waiting.attemptId)
    await connectFake(s.t.id, FAKE_ACCOUNT.settleUnavailable)

    expect(await recheck(s, 1)).toEqual({ taken: 0, unpaid: 1, waiting: 1 })

    expect(await attempt(s, waiting.attemptId)).toMatchObject({ rechecked_at: null })
    expect((await attempt(s, behind.attemptId)).rechecked_at).not.toBeNull()
  })

  // The account the attempt started with gave way to one of another provider: nobody is left to
  // ask, as when the expiry finds it so.
  it('asks nobody about an attempt whose provider the convention no longer holds', async () => {
    const s = await shop()
    const { placed, attemptId } = await expired(s)
    fake().pay(attemptId)
    await connectAccount(s.t.id, 'przelewy24', {
      merchantId: '1',
      posId: '1',
      crc: 'c',
      apiKey: 'k',
    })

    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 1, waiting: 0 })

    expect(await s.stored(placed)).toMatchObject({ status: 'expired' })
    expect((await attempt(s, attemptId)).rechecked_at).not.toBeNull()
  })

  it('asks only about an attempt nobody confirmed, of an order that expired', async () => {
    const s = await shop()
    // A payment confirmed late, by its notification, was taken already.
    const late = await expired(s)
    await request(app.getHttpServer())
      .post(`/payments/fake/notifications/${late.attemptId}`)
      .send(fake().pay(late.attemptId))
      .expect(200)
    // An order the expiry has not reached past its hold is the expiry's own to ask about.
    const waiting = await s.place('waiting@example.test')
    const open = await s.started(waiting)
    await setColumn('orders', waiting.orderId, 'hold_ends_at', ago(HOUR + 1))

    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 0, waiting: 0 })

    expect(await attempt(s, open)).toMatchObject({ status: 'started', rechecked_at: null })
    expect(await attempt(s, late.attemptId)).toMatchObject({ status: 'paid', rechecked_at: null })
  })

  it('passes by the attempts of a suspended convention, and asks once it is restored', async () => {
    const s = await shop()
    const { attemptId } = await expired(s)

    await suspend(s.t.id)
    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 0, waiting: 0 })
    expect(await attempt(s, attemptId)).toMatchObject({ rechecked_at: null })

    await restore(s.t.id)
    expect(await recheck(s)).toEqual({ taken: 0, unpaid: 1, waiting: 0 })
  })

  // Safe with several API processes: the order's lock lets one of them take the payment.
  it('takes a payment once when it runs twice at the same moment', async () => {
    const s = await shop()
    const { placed, attemptId } = await expired(s)
    fake().pay(attemptId)

    await Promise.all([recheck(s), recheck(s), recheck(s)])

    expect(await s.stored(placed)).toMatchObject({ status: 'paid' })
    const confirmations = (await s.emails()).filter(([kind]) => kind === 'order-confirmation')
    expect(confirmations).toEqual([['order-confirmation', 'buyer@example.test']])
  })
})
