import { type NestExpressApplication } from '@nestjs/platform-express'
import {
  type Offer,
  type PlacedOrder,
  RESULT_TOKEN_HEADER,
  type StartedAttempt,
} from '@opos/contract'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { STAND_IN_TOKEN } from '../src/modules/checkout/bot-check'
import { OrderEmailsOutbox } from '../src/modules/checkout/order-emails.service'
import { OrderExpiry } from '../src/modules/checkout/order-expiry.service'
import { Przelewy24Provider } from '../src/modules/payments/przelewy24/przelewy24-provider'
import { CHANNELS, registrationSignature } from '../src/modules/payments/przelewy24/signature'
import { createApp } from './app'
import { deleteCreatedAccounts, session, testEmail } from './auth'
import { deleteMail, waitForMail } from './mailpit'
import { Przelewy24StandIn, type StandInAccount } from './przelewy24-stand-in'
import {
  addEdition,
  addTicketType,
  closeTenantDb,
  connectAccount,
  deleteCreatedTenants,
  makeShopReady,
  openShop,
  setColumn,
  setPublished,
  storedRows,
  tenantWithHead,
  jobTime,
} from './tenants'

// Przelewy24 behind the port of a payment provider (docs/specs/0005-przelewy24.md), against a
// stand-in for its API that answers as its documentation says. The rules of the order are those
// of checkout and orders: here is only what is Przelewy24's own.

let app: NestExpressApplication
let p24: Przelewy24StandIn
const env = loadEnv()
const addresses: string[] = []

beforeAll(async () => {
  p24 = await Przelewy24StandIn.start()
  app = await createApp({
    PRZELEWY24_URL: p24.url,
    PRZELEWY24_SANDBOX_URL: p24.url,
    API_EGRESS_ADDRESS: '203.0.113.7',
  })
  await app.listen(0, '127.0.0.1')
})

afterEach(() => {
  p24.down = false
  p24.verificationDown = false
})

afterAll(async () => {
  await Promise.all(addresses.map((address) => deleteMail(address)))
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
  await p24.close()
})

const MINUTE = 60_000
let nextMerchant = 100_000

/** An account Przelewy24 knows, and its credentials as an org gives them. */
function merchant(changes: Record<string, string> = {}) {
  nextMerchant += 1
  const account: StandInAccount = p24.account({
    merchantId: nextMerchant,
    posId: nextMerchant,
    apiKey: `api-key-of-${nextMerchant}`,
    crc: `crc-key-of-${nextMerchant}`,
  })
  const credentials = {
    merchantId: String(account.merchantId),
    posId: String(account.posId),
    crc: account.crc,
    apiKey: account.apiKey,
    sandbox: 'false',
    abandonedPaymentEmailOff: 'true',
    ...changes,
  }
  return { account, credentials }
}

/** A published edition with an open shop paid into a Przelewy24 account, and one ticket type. */
async function shop(ticketType: Parameters<typeof addTicketType>[2] = {}) {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id)
  await setPublished(edition, true)
  await makeShopReady(t.id, edition)
  const { account, credentials } = merchant()
  await connectAccount(t.id, 'przelewy24', credentials)
  await openShop(t.id, edition)
  const standard = await addTicketType(t.id, edition, { name: 'Standard', ...ticketType })
  const editions = await request(app.getHttpServer()).get(`/public/tenants/${t.slug}/editions`)
  const slug = (editions.body as { slug: string }[])[0]!.slug
  const order = (email: string, expectedTotalMinor = 10000) =>
    request(app.getHttpServer())
      .post(`/public/tenants/${t.slug}/editions/${slug}/shop/orders`)
      .send({
        cart: { ticket: { ticketTypeId: standard } },
        holderName: 'Ada Lovelace',
        ageBand: 'adult',
        email,
        emailConfirmation: email,
        // Przelewy24 asks its consent on its own page: the shop has none to accept.
        providerConsentAccepted: false,
        expectedTotalMinor,
        botCheckToken: STAND_IN_TOKEN,
      })
  const place = async (email = 'buyer@example.test') =>
    (await order(email).expect(201)).body as PlacedOrder
  const start = (placed: PlacedOrder) =>
    request(app.getHttpServer())
      .post(`/public/tenants/${t.slug}/orders/${placed.orderId}/payment-attempts`)
      .set(RESULT_TOKEN_HEADER, placed.resultToken)
  /** Starts an attempt and answers its identifier: the `sessionId` of its transaction. */
  const started = async (placed: PlacedOrder) => {
    await start(placed).expect(201)
    const attempts = await storedRows('payment_attempts', t.id)
    return String(attempts.findLast((attempt) => attempt.order_id === placed.orderId)!.id)
  }
  const stored = async (placed: PlacedOrder) =>
    (await storedRows('orders', t.id)).find((row) => row.id === placed.orderId)!
  const attempts = () => storedRows('payment_attempts', t.id)
  const offer = async () =>
    (await request(app.getHttpServer()).get(`/public/tenants/${t.slug}/editions/${slug}/shop`))
      .body as Offer
  return {
    t,
    edition,
    slug,
    standard,
    account,
    order,
    place,
    start,
    started,
    stored,
    attempts,
    offer,
  }
}

const notify = (attemptId: string, body: object) =>
  request(app.getHttpServer()).post(`/payments/przelewy24/notifications/${attemptId}`).send(body)
const notifyMore = (attemptId: string, body: object) =>
  request(app.getHttpServer())
    .post(`/payments/przelewy24/notifications/${attemptId}/additional`)
    .send(body)
const verifications = (sessionId: string) =>
  p24
    .calls('PUT', '/api/v1/transaction/verify')
    .filter((call) => call.body?.sessionId === sessionId)

describe('connecting a Przelewy24 account', () => {
  const connect = (t: Awaited<ReturnType<typeof tenantWithHead>>, credentials: object) =>
    request(app.getHttpServer())
      .put('/shop/provider-account')
      .use(session(t.head.token))
      .set('X-Tenant-Slug', t.slug)
      .send({ provider: 'przelewy24', credentials })

  it('checks the credentials with the access test, and is ready once the org confirmed the email is off', async () => {
    const t = await tenantWithHead()
    const { account, credentials } = merchant()

    const res = await connect(t, credentials).expect(200)

    expect(res.body).toMatchObject({
      account: { provider: 'przelewy24', ready: true, missing: [] },
    })
    // Asked with the point of sale's identifier and the API key, and nothing else.
    const [call] = p24.received.slice(-1)
    expect(call).toMatchObject({ method: 'GET', path: '/api/v1/testAccess' })
    // Stored sealed, and never answered: no key is in what the API said or keeps in the clear.
    const [row] = await storedRows('payment_provider_accounts', t.id)
    for (const secret of [account.crc, account.apiKey]) {
      expect(JSON.stringify(res.body)).not.toContain(secret)
      expect(JSON.stringify(row)).not.toContain(secret)
    }
  })

  // Przelewy24 answers its API only to the addresses its panel lists for the account.
  it('shows the org the address the API calls Przelewy24 from', async () => {
    const t = await tenantWithHead()

    const res = await request(app.getHttpServer())
      .get('/shop/provider-account')
      .use(session(t.head.token))
      .set('X-Tenant-Slug', t.slug)
      .expect(200)

    expect(res.body).toEqual({
      account: null,
      providers: ['fake', 'przelewy24'],
      callsFrom: '203.0.113.7',
    })
  })

  it('is not ready until the org confirms Przelewy24’s own email for an abandoned payment is off', async () => {
    const t = await tenantWithHead()
    const { credentials } = merchant({ abandonedPaymentEmailOff: 'false' })

    const res = await connect(t, credentials).expect(200)

    expect(res.body).toMatchObject({
      account: { ready: false, missing: ['przelewy24.abandoned-payment-email-on'] },
    })
  })

  it('stores nothing of credentials Przelewy24 refuses, or of ones that name no account', async () => {
    const t = await tenantWithHead()
    const { credentials } = merchant()

    for (const refused of [
      { ...credentials, apiKey: 'another-key' },
      { ...credentials, merchantId: 'not-a-number' },
      { merchantId: credentials.merchantId },
    ]) {
      const res = await connect(t, refused).expect(422)
      expect(res.body).toMatchObject({ code: 'provider.credentials-refused' })
    }
    expect(await storedRows('payment_provider_accounts', t.id)).toEqual([])
  })

  it('stores nothing while Przelewy24 does not answer, and says so', async () => {
    const t = await tenantWithHead()
    const { credentials } = merchant()
    p24.down = true

    const res = await connect(t, credentials).expect(503)

    expect(res.body).toMatchObject({ code: 'provider.unavailable' })
    expect(await storedRows('payment_provider_accounts', t.id)).toEqual([])
  })

  // A sandbox account takes no real money: it connects on no production convention.
  it('connects a sandbox account outside production alone', async () => {
    const { credentials } = merchant({ sandbox: 'true' })
    const here = new Przelewy24Provider({ sandboxAllowed: false })

    expect(await here.connect(credentials)).toEqual({ outcome: 'refused' })
    const t = await tenantWithHead()
    await connect(t, credentials).expect(200)
  })
})

describe('the shop of a convention paid through Przelewy24', () => {
  it('names three methods, asks no consent of the provider and takes an email of 50 characters', async () => {
    const s = await shop()

    expect((await s.offer()).provider).toEqual({
      name: 'przelewy24',
      methods: ['blik', 'transfer', 'card'],
      consent: null,
      maxEmailLength: 50,
    })
    const fifty = `${'a'.repeat(37)}@example.test`
    expect(fifty).toHaveLength(50)
    await s.order(fifty).expect(201)
    const res = await s.order(`a${fifty}`).expect(422)
    expect(res.body).toMatchObject({ code: 'order.email-refused' })
  })
})

describe('a payment attempt at Przelewy24', () => {
  it('registers a transaction of its own, saved first, and sends the buyer to Przelewy24’s page', async () => {
    const s = await shop()
    const placed = await s.place()

    const res = await s.start(placed).set('Accept-Language', 'en').expect(201)

    const [attempt] = await s.attempts()
    const attemptId = String(attempt!.id)
    expect((res.body as StartedAttempt).redirectUrl).toBe(
      `${p24.url}/trnRequest/TOKEN-${attemptId}`,
    )
    const [call] = p24.calls('POST', '/api/v1/transaction/register').slice(-1)
    const api = env.API_URL.replace(/\/$/, '')
    expect(call!.body).toEqual({
      merchantId: s.account.merchantId,
      posId: s.account.posId,
      // Each attempt is a transaction of its own, its session the attempt's identifier.
      sessionId: attemptId,
      amount: 10000,
      currency: 'PLN',
      description: `Order ${placed.number}`,
      email: 'buyer@example.test',
      country: 'PL',
      language: 'en',
      urlReturn: expect.stringContaining(`/shop/result/${placed.orderId}?token=`) as string,
      urlStatus: `${api}/payments/przelewy24/notifications/${attemptId}`,
      // The whole minutes left of the order's hold.
      timeLimit: expect.any(Number) as number,
      // Cards, bank transfers and BLIK.
      channel: CHANNELS,
      waitForResult: true,
      regulationAccept: false,
      transferLabel: placed.number,
      urlCardPaymentNotification: `${api}/payments/przelewy24/notifications/${attemptId}/additional`,
      sign: registrationSignature(
        { sessionId: attemptId, merchantId: s.account.merchantId, amount: 10000, currency: 'PLN' },
        s.account.crc,
      ),
    })
    const { timeLimit, urlStatus, urlReturn, transferLabel } = call!.body as Record<string, string>
    expect(Number(timeLimit)).toBeGreaterThanOrEqual(29)
    expect(Number(timeLimit)).toBeLessThanOrEqual(30)
    // Each address fits the 250 characters Przelewy24 takes, and the title of a transfer its 20.
    for (const address of [urlStatus, urlReturn]) expect(address!.length).toBeLessThanOrEqual(250)
    expect(transferLabel).toMatch(/^[A-Za-z0-9]{1,20}$/)
    // The buyer's name is not sent.
    expect(JSON.stringify(call!.body)).not.toContain('Ada')
    expect(attempt).toMatchObject({
      provider: 'przelewy24',
      status: 'started',
      amount_minor: 10000,
    })
  })

  it('limits the transaction to what is left of the hold, at least a minute', async () => {
    const s = await shop()
    const placed = await s.place()
    await setColumn(
      'orders',
      placed.orderId,
      'hold_ends_at',
      new Date(Date.now() + 5 * MINUTE + 30_000).toISOString(),
    )

    const attemptId = await s.started(placed)

    expect(p24.transaction(attemptId)!.registered.timeLimit).toBe(5)
  })

  it('ends an attempt Przelewy24 did not register, and says the provider is unavailable', async () => {
    const s = await shop()
    const placed = await s.place()
    p24.down = true

    const res = await s.start(placed).expect(503)

    expect(res.body).toMatchObject({ code: 'provider.unavailable' })
    expect(await s.attempts()).toMatchObject([{ status: 'ended' }])
  })
})

describe('a payment Przelewy24 reports', () => {
  it('is verified at once, and only then pays the order', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const body = p24.pay(attemptId)

    await notify(attemptId, body).expect(200)

    // Verified with the amount paid and Przelewy24's own number of the transaction.
    expect(verifications(attemptId)).toHaveLength(1)
    expect(verifications(attemptId)[0]!.body).toMatchObject({
      sessionId: attemptId,
      orderId: body.orderId,
      amount: 10000,
      currency: 'PLN',
    })
    expect(p24.transaction(attemptId)!.status).toBe(2)
    expect(await s.stored(placed)).toMatchObject({ status: 'paid' })
    // The attempt keeps the provider's number of the transaction, as text, and once the
    // provider gives them the payout batch and the commission.
    expect(await s.attempts()).toMatchObject([
      {
        status: 'paid',
        paid_amount_minor: 10000,
        money_with: 'convention',
        provider_reference: String(body.orderId),
        information: {
          transaction: String(body.orderId),
          batch: '55001',
          commissionMinor: '129',
        },
      },
    ])
  })

  it('changes nothing when it is repeated, and is not verified again', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const body = p24.pay(attemptId)

    await notify(attemptId, body).expect(200)
    await notify(attemptId, body).expect(200)

    expect(verifications(attemptId)).toHaveLength(1)
    expect(await storedRows('order_qr_codes', s.t.id)).toHaveLength(1)
  })

  it('counts only once its signature holds, with the key of its own convention', async () => {
    const [s, other] = [await shop(), await shop()]
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const theirs = await other.started(await other.place())
    const body = p24.pay(attemptId)

    for (const forged of [
      { ...body, amount: 1 },
      { ...body, sign: 'f'.repeat(96) },
      { ...body, sign: undefined },
      // Signed by another convention's account, about its own transaction.
      p24.pay(theirs),
      { ...p24.pay(theirs), sessionId: attemptId },
    ]) {
      await notify(attemptId, forged).expect(404)
    }

    expect(await s.stored(placed)).toMatchObject({ status: 'awaiting-payment' })
    expect(verifications(attemptId)).toEqual([])
  })

  it('is taken again when the verification did not answer', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const body = p24.pay(attemptId)
    p24.verificationDown = true

    const res = await notify(attemptId, body).expect(503)

    expect(res.body).toMatchObject({ code: 'provider.unavailable' })
    expect(await s.stored(placed)).toMatchObject({ status: 'awaiting-payment' })

    // Przelewy24 repeats its notification until the transaction is verified.
    p24.verificationDown = false
    await notify(attemptId, body).expect(200)
    expect(await s.stored(placed)).toMatchObject({ status: 'paid' })
  })

  // A payment that sends its order to review is verified too: the money is then with the
  // convention, for an org to settle.
  it('of another amount is verified with the amount paid, and sends the order to review', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)

    await notify(attemptId, p24.pay(attemptId, { amount: 9000 })).expect(200)

    expect(verifications(attemptId)[0]!.body).toMatchObject({ amount: 9000 })
    expect(await s.stored(placed)).toMatchObject({ status: 'needs-review' })
    expect(await s.attempts()).toMatchObject([
      { status: 'paid', paid_amount_minor: 9000, money_with: 'convention' },
    ])
  })

  it('for an order that no longer needs it is never verified, and the buyer is told where the money is', async () => {
    const s = await shop()
    const to = testEmail('buyer')
    addresses.push(to)
    const placed = await s.place(to)
    const [first, second] = [await s.started(placed), await s.started(placed)]

    await notify(first, p24.pay(first)).expect(200)
    await notify(second, p24.pay(second)).expect(200)

    // Refused by not verifying it: the money stays at the buyer's disposal at Przelewy24.
    expect(verifications(second)).toEqual([])
    expect(p24.transaction(second)!.status).toBe(1)
    expect(await s.attempts()).toMatchObject([
      { id: first, status: 'paid', money_with: 'convention' },
      { id: second, status: 'refused', money_with: 'buyer' },
    ])
    await setColumn('tenants', s.t.id, 'default_locale', 'en')
    await app.get(OrderEmailsOutbox).run(jobTime(), { tenantId: s.t.id })
    const mails = await waitForMail(to, 2)
    const notNeeded = mails.find((mail) => mail.Subject.includes('does not need'))!
    expect(notNeeded.Text).toContain('stays at your disposal at Przelewy24')
    expect(notNeeded.Text).toContain('after 30 days')
  })
})

describe('the state of an attempt at Przelewy24', () => {
  // A payment made within the hold counts whenever it is found, also when its notification
  // never came: the expiry reads the transaction by its session, then verifies it.
  it('finds a payment whose notification never came, and verifies it', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    p24.pay(attemptId, { date: '20260501103000' })
    await setColumn(
      'orders',
      placed.orderId,
      'hold_ends_at',
      new Date(Date.now() - MINUTE).toISOString(),
    )

    await app.get(OrderExpiry).run(new Date(), { tenantId: s.t.id })

    expect(await s.stored(placed)).toMatchObject({ status: 'paid' })
    expect(verifications(attemptId)).toHaveLength(1)
    const [attempt] = await s.attempts()
    // Made at the provider's own date of it, which is Warsaw's clock.
    expect(new Date(String(attempt!.paid_at)).toISOString()).toBe('2026-05-01T08:30:00.000Z')
  })

  it('expires an order nobody paid, and leaves one whose provider does not answer', async () => {
    const s = await shop()
    const [unpaid, unknown] = [await s.place(), await s.place('other@example.test')]
    await s.started(unpaid)
    await setColumn(
      'orders',
      unpaid.orderId,
      'hold_ends_at',
      new Date(Date.now() - MINUTE).toISOString(),
    )

    await app.get(OrderExpiry).run(new Date(), { tenantId: s.t.id })
    expect(await s.stored(unpaid)).toMatchObject({ status: 'expired' })

    await s.started(unknown)
    await setColumn(
      'orders',
      unknown.orderId,
      'hold_ends_at',
      new Date(Date.now() - MINUTE).toISOString(),
    )
    p24.down = true
    await app.get(OrderExpiry).run(new Date(), { tenantId: s.t.id })
    expect(await s.stored(unknown)).toMatchObject({ status: 'awaiting-payment' })
  })

  it('confirms an earlier attempt that was paid instead of starting another', async () => {
    const s = await shop()
    const placed = await s.place()
    const first = await s.started(placed)
    p24.pay(first)

    const res = await s.start(placed).expect(409)

    expect(res.body).toMatchObject({ code: 'order.already-paid' })
    expect(verifications(first)).toHaveLength(1)
    expect(await s.stored(placed)).toMatchObject({ status: 'paid' })
  })
})

describe('an additional notification of Przelewy24', () => {
  it.each([
    ['err56', 'declined'],
    ['err161', 'canceled'],
    // A code the module does not know is the general failure.
    ['E-4012', 'failed'],
  ])(
    'of a card refused with %s fails the attempt as %s, with the provider’s code kept',
    async (code, reason) => {
      const s = await shop()
      const placed = await s.place()
      const attemptId = await s.started(placed)

      await notifyMore(attemptId, p24.cardRefused(attemptId, code, 'Odmowa banku')).expect(200)

      expect(await s.attempts()).toMatchObject([
        {
          status: 'failed',
          failure_reason: reason,
          failure_code: code,
          failure_message: 'Odmowa banku',
        },
      ])
      expect(await s.stored(placed)).toMatchObject({ status: 'awaiting-payment', holds: true })
    },
  )

  // A failure does not close the attempt: a payment confirmed for it later still counts.
  it('of a refusal does not close the attempt: a payment for it afterwards is still verified', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    await notifyMore(attemptId, p24.cardRefused(attemptId, 'err56')).expect(200)

    await notify(attemptId, p24.pay(attemptId)).expect(200)

    expect(verifications(attemptId)).toHaveLength(1)
    expect(await s.stored(placed)).toMatchObject({ status: 'paid' })
  })

  // An order is paid only by the notification of the payment itself and its verification.
  it('of a card payment that went through changes nothing, and nothing of the card is kept', async () => {
    const s = await shop()
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const card = p24.cardPaid(attemptId)

    await notifyMore(attemptId, card).expect(200)

    expect(await s.stored(placed)).toMatchObject({ status: 'awaiting-payment' })
    expect(verifications(attemptId)).toEqual([])
    const kept = JSON.stringify([await s.attempts(), await s.stored(placed)])
    for (const detail of [
      card.maskedCCNumber,
      String(card.bin),
      card.refId,
      card.hash,
      card.ccExp,
    ]) {
      expect(kept).not.toContain(detail)
    }
  })

  it('counts only once its signature holds, for its own convention’s attempt', async () => {
    const [s, other] = [await shop(), await shop()]
    const placed = await s.place()
    const attemptId = await s.started(placed)
    const theirs = await other.started(await other.place())
    const refusal = p24.cardRefused(attemptId, 'err56')

    for (const forged of [
      { ...refusal, errorCode: 'err161' },
      { ...refusal, sign: 'f'.repeat(96) },
      p24.cardRefused(theirs, 'err56'),
      { ...p24.cardRefused(theirs, 'err56'), sessionId: attemptId },
      { ...p24.cardPaid(attemptId), amount: 1 },
    ]) {
      await notifyMore(attemptId, forged).expect(404)
    }
    // A refusal is not taken on the address of the payment's own notification.
    await notify(attemptId, refusal).expect(404)

    expect(await s.attempts()).toMatchObject([{ status: 'started', failure_reason: null }])
  })

  // The documentation gives neither the fields of its result nor how it is signed: until it
  // does, nothing of it counts.
  it('of BLIK is not read', async () => {
    const s = await shop()
    const attemptId = await s.started(await s.place())
    const { orderId } = p24.transaction(attemptId)!

    await notifyMore(attemptId, {
      data: {
        orderId,
        sessionId: attemptId,
        method: 181,
        result: { status: 'AUTHORIZED' },
        sign: 'x',
      },
    }).expect(404)

    expect(await s.attempts()).toMatchObject([{ status: 'started', failure_reason: null }])
  })
})
