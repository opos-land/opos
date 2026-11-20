import { createHash } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { type PlacedOrder, RESULT_TOKEN_HEADER, type StartedAttempt } from '@opos/contract'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { STAND_IN_TOKEN } from '../src/modules/checkout/bot-check'
import { OrderEmailsOutbox, retryDelayMs } from '../src/modules/checkout/order-emails.service'
import { OrderExpiry } from '../src/modules/checkout/order-expiry.service'
import { MailService } from '../src/modules/mail/mail.service'
import { type FakeProvider } from '../src/modules/payments/fake-provider'
import { PROVIDER_MODULES } from '../src/modules/payments/payment-providers'
import { createApp } from './app'
import { createAccount, deleteCreatedAccounts, testEmail } from './auth'
import { deleteMail, type Mail, waitForMail } from './mailpit'
import {
  addConsent,
  addEdition,
  addMerchandiseItem,
  addTicketType,
  closeTenantDb,
  connectFake,
  deleteCreatedTenants,
  makeShopReady,
  offerWith,
  openShop,
  restore,
  setCatalogSettings,
  setColumn,
  setPublished,
  storedRows,
  suspend,
  tenantWithHead,
} from './tenants'

// The emails of an order (docs/specs/0004-checkout-and-orders.md, Emails): each is queued by its
// cause, listed on its order and never lost to a failed send. It is written in its recipient's
// language, or the convention's for an address with no account.

let app: NestExpressApplication
const addresses: string[] = []

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await Promise.all(addresses.map((address) => deleteMail(address)))
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const fake = () => app.get<Map<string, FakeProvider>>(PROVIDER_MODULES).get('fake')!
/** The outbox for one tenant alone: other tests queue emails of their own beside this one. */
const send = (s: { t: { id: string } }, now = new Date()) =>
  app.get(OrderEmailsOutbox).run(now, { tenantId: s.t.id })
/** An address of a buyer no other test writes to, cleaned from Mailpit afterwards. */
const buyer = () => {
  const address = testEmail('buyer')
  addresses.push(address)
  return address
}
const mailTo = async (address: string, count = 1): Promise<Mail[]> => {
  addresses.push(address)
  return waitForMail(address, count)
}

/** A published edition with an open shop, a connected fake account and one ticket type. */
async function shop(locale?: string) {
  const t = await tenantWithHead(locale)
  addresses.push(t.head.email)
  const edition = await addEdition(t.id, { endsAt: '2027-06-03T00:00:00Z' })
  await setPublished(edition, true)
  const ready = await makeShopReady(t.id, edition)
  await connectFake(t.id)
  await openShop(t.id, edition)
  const standard = await addTicketType(t.id, edition, { name: 'Standard' })
  const editions = await request(app.getHttpServer()).get(`/public/tenants/${t.slug}/editions`)
  const slug = (editions.body as { slug: string }[])[0]!.slug
  const place = async (email: string, changes: Record<string, unknown> = {}) => {
    const res = await request(app.getHttpServer())
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
        ...changes,
      })
      .expect(201)
    return res.body as PlacedOrder
  }
  const started = async (placed: PlacedOrder) => {
    const res = await request(app.getHttpServer())
      .post(`/public/tenants/${t.slug}/orders/${placed.orderId}/payment-attempts`)
      .set(RESULT_TOKEN_HEADER, placed.resultToken)
      .expect(201)
    return (res.body as StartedAttempt).redirectUrl.split('/').pop()!
  }
  /** The buyer pays the attempt at the fake provider, which tells the API. */
  const paid = (attemptId: string, amountMinor?: number) =>
    request(app.getHttpServer())
      .post(`/payments/fake/notifications/${attemptId}`)
      .send(fake().pay(attemptId, { amountMinor }))
      .expect(200)
  const pay = async (placed: PlacedOrder, amountMinor?: number) => {
    await paid(await started(placed), amountMinor)
  }
  const emails = () => storedRows('order_emails', t.id)
  return {
    t,
    name: `Tenant ${t.slug}`,
    edition,
    slug,
    standard,
    ready,
    place,
    started,
    paid,
    pay,
    emails,
  }
}

describe('the confirmation of a paid order', () => {
  it('is sent once with the lines, the total, the QR code, an order link and the seller', async () => {
    const s = await shop()
    const to = buyer()
    const pin = await addMerchandiseItem(s.t.id, s.edition, { name: 'Pin', stock: 5 })
    await offerWith(s.t.id, s.edition, s.standard, { itemIds: [pin.id] })
    const terms = await addConsent(s.t.id, s.edition, { documentId: s.ready.terms.id })
    const placed = await s.place(to, {
      cart: {
        ticket: { ticketTypeId: s.standard },
        items: [{ variantId: pin.variantId, quantity: 2 }],
      },
      consentIds: [terms],
      expectedTotalMinor: 20000,
    })
    await s.pay(placed)

    expect(await send(s)).toMatchObject({ sent: 1, failed: 0 })

    const [mail] = await mailTo(to)
    // No account under the address: the convention's language, Polish by default.
    expect(mail!.Subject).toBe(
      `Twoje zamówienie ${placed.number} w sklepie konwentu ${s.name} jest opłacone`,
    )
    expect(mail!.Text).toContain('Standard: 100,00 zł')
    expect(mail!.Text).toContain('2 × Pin: 100,00 zł')
    expect(mail!.Text).toContain('Razem: 200,00 zł')
    expect(mail!.Text).toContain('Gadżety odbiera się na konwencie')
    expect(mail!.Text).toContain('Seller Ltd')
    // The version of the terms the buyer accepted, at the address anyone reads it at.
    expect(mail!.Text).toContain(
      `/public/tenants/${s.t.slug}/document-versions/${s.ready.terms.versionIds[0]}`,
    )
    expect(mail!.Text).not.toMatch(/Zaloguj się|opiekuna/)
    // The QR code as text, and as a picture that travels with the message.
    const code = /Kod QR zamówienia \S+: ([A-Z2-7]{32})/.exec(mail!.Text)?.[1]
    expect(code).toBeDefined()
    expect(mail!.HTML).toContain('<img src="cid:qr-code@opos"')
    // The order link carries a secret of which only the hash is kept, valid until 30 days after
    // the edition ends.
    const token = /\/orders\/([A-Za-z0-9_-]{43})/.exec(mail!.Text)?.[1]
    expect(token).toBeDefined()
    const [link] = await storedRows('order_links', s.t.id)
    expect(link).toMatchObject({
      order_id: placed.orderId,
      token_hash: createHash('sha256').update(token!).digest('hex'),
      ended_at: null,
    })
    expect(new Date(String(link!.expires_at)).getTime()).toBe(
      new Date('2027-06-03T00:00:00Z').getTime() + 30 * DAY,
    )

    // Sent, it is listed on its order and not sent again.
    expect(await s.emails()).toMatchObject([{ kind: 'order-confirmation', failed_attempts: 0 }])
    expect((await s.emails())[0]!.sent_at).not.toBeNull()
    expect(await send(s)).toMatchObject({ sent: 0 })
    expect(await mailTo(to)).toHaveLength(1)
  })

  it('is written in the language of the account whose address it is, with a sign-in link', async () => {
    const s = await shop()
    const account = await createAccount({ locale: 'en' })
    await s.pay(await s.place(account.email))

    await send(s)

    const [mail] = await mailTo(account.email)
    expect(mail!.Subject).toMatch(/^Your order \S+ for .+ is paid$/)
    expect(mail!.Text).toMatch(/Sign in: \S+\/login/)
  })

  it('is written in the convention’s language for an address with no account', async () => {
    const s = await shop('en')
    const to = buyer()
    await s.pay(await s.place(to))

    await send(s)

    const [mail] = await mailTo(to)
    expect(mail!.Subject).toMatch(/^Your order /)
    expect(mail!.Text).not.toContain('Sign in')
  })

  it('tells the buyer of a teen’s ticket of the guardian consent, with the edition’s form', async () => {
    const s = await shop('en')
    const to = buyer()
    await setCatalogSettings(s.t.id, s.edition, {
      guardianConsentFormUrl: 'https://convention.test/consent.pdf',
    })
    await s.pay(await s.place(to, { ageBand: 'teen', guardianConsentAcknowledged: true }))

    await send(s)

    const [mail] = await mailTo(to)
    expect(mail!.Text).toContain('The ticket holder is a teen')
    expect(mail!.Text).toContain(
      'Download the guardian consent form: https://convention.test/consent.pdf',
    )
  })
})

describe('the other emails of an order', () => {
  it('tell the buyer of an expired order the way to a new one', async () => {
    const s = await shop('en')
    const to = buyer()
    const placed = await s.place(to)
    await setColumn(
      'orders',
      placed.orderId,
      'hold_ends_at',
      new Date(Date.now() - MINUTE).toISOString(),
    )
    await app.get(OrderExpiry).run(new Date(), { tenantId: s.t.id })

    await send(s)

    const [mail] = await mailTo(to)
    expect(mail!.Subject).toBe(`Your order ${placed.number} for ${s.name} has expired`)
    expect(mail!.Text).toMatch(new RegExp(`/conventions/${s.t.slug}/${s.slug}/shop`))
  })

  it('tell the buyer and the orgs of an order that needs review, each in their own language', async () => {
    const s = await shop('en')
    const to = buyer()
    const placed = await s.place(to)
    await s.pay(placed, 9000)

    expect(await send(s)).toMatchObject({ sent: 2 })

    const [toBuyer] = await mailTo(to)
    expect(toBuyer!.Subject).toBe(`Your payment for the order ${placed.number} is under review`)
    // Where the money is, as the provider's module words it.
    expect(toBuyer!.Text).toContain(fake().moneyWith('convention').en)
    expect(toBuyer!.Text).toContain('shop@seller.test')
    const [toOrg] = await mailTo(s.t.head.email)
    expect(toOrg!.Subject).toContain(placed.number)
    expect(toOrg!.Text).toMatch(/90[.,]00/)
    expect(toOrg!.Text).toMatch(/100[.,]00/)
  })

  it('tell the buyer of a payment the order did not need where the money is', async () => {
    const s = await shop('en')
    const to = buyer()
    const placed = await s.place(to)
    // Two attempts of one order are both paid: the second is refused, and its money stays with
    // the buyer.
    const [first, second] = [await s.started(placed), await s.started(placed)]
    await s.paid(first)
    await s.paid(second)

    await send(s)

    const mails = await mailTo(to, 2)
    const notNeeded = mails.find((mail) => mail.Subject.includes('does not need'))
    expect(notNeeded!.Subject).toBe(
      `A payment arrived that your order ${placed.number} does not need`,
    )
    expect(notNeeded!.Text).toContain(fake().moneyWith('buyer').en)
    expect(mails.map((mail) => mail.Subject)).toContain(
      `Your order ${placed.number} for ${s.name} is paid`,
    )
  })
})

describe('the outbox', () => {
  it('tries a failed send again after a growing delay, and loses no email to it', async () => {
    const s = await shop('en')
    const to = buyer()
    await s.pay(await s.place(to))
    const smtp = vi
      .spyOn(app.get(MailService), 'sendOrderEmail')
      .mockRejectedValueOnce(new Error('the SMTP server is down'))

    expect(await send(s)).toMatchObject({ sent: 0, failed: 1 })

    const [failed] = await s.emails()
    expect(failed).toMatchObject({ sent_at: null, failed_attempts: 1 })
    const next = new Date(String(failed!.next_attempt_at)).getTime()
    expect(next).toBeGreaterThan(Date.now() + retryDelayMs(1) - 5000)
    // Not due yet: nothing is sent until its time comes.
    expect(await send(s)).toMatchObject({ sent: 0, failed: 0 })
    expect(smtp).toHaveBeenCalledTimes(1)

    expect(await send(s, new Date(next + 1000))).toMatchObject({ sent: 1 })
    expect(await s.emails()).toMatchObject([{ failed_attempts: 1 }])
    expect((await s.emails())[0]!.sent_at).not.toBeNull()
    expect(await mailTo(to)).toHaveLength(1)
  })

  it('waits a minute after the first failure and twice as long after each, up to six hours', () => {
    expect([1, 2, 3, 4, 9, 10, 50].map((failed) => retryDelayMs(failed) / MINUTE)).toEqual([
      1, 2, 4, 8, 256, 360, 360,
    ])
  })

  // Safe with several API processes: an email is claimed under a lock that the others skip.
  it('sends an email once when it runs twice at the same moment', async () => {
    const s = await shop('en')
    const to = buyer()
    await s.pay(await s.place(to))

    const runs = await Promise.all([send(s), send(s), send(s)])

    expect(runs.reduce((sent, run) => sent + run.sent, 0)).toBe(1)
    expect(await mailTo(to)).toHaveLength(1)
  })

  it('passes by the emails of a suspended convention, and sends them once it is restored', async () => {
    const s = await shop('en')
    const to = buyer()
    await s.pay(await s.place(to))

    await suspend(s.t.id)
    await send(s)
    expect((await s.emails())[0]!.sent_at).toBeNull()

    await restore(s.t.id)
    await send(s)
    expect(await mailTo(to)).toHaveLength(1)
  })
})
