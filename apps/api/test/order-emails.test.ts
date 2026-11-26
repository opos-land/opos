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
import { createAccount, deleteCreatedAccounts, session, testEmail } from './auth'
import { deleteMail, type Mail, waitForMail } from './mailpit'
import {
  addConsent,
  addEdition,
  addMerchandiseItem,
  addTicketType,
  closeTenantDb,
  connectFake,
  deleteCreatedTenants,
  jobTime,
  makeShopReady,
  offerWith,
  queueOrderEmail,
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
const send = (s: { t: { id: string } }, now = jobTime()) =>
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
      consents: [{ consentId: terms, documentVersionId: s.ready.terms.versionIds[0] }],
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
    const token = /\/order#([A-Za-z0-9_-]{43})/.exec(mail!.Text)?.[1]
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

  it('tells where merchandise is picked up when the edition says so', async () => {
    const s = await shop('en')
    const to = buyer()
    const pin = await addMerchandiseItem(s.t.id, s.edition, { name: 'Pin', stock: 5 })
    await offerWith(s.t.id, s.edition, s.standard, { itemIds: [pin.id] })
    await setCatalogSettings(s.t.id, s.edition, { pickupInformation: 'At the desk in hall A.' })
    await s.pay(
      await s.place(to, {
        cart: {
          ticket: { ticketTypeId: s.standard },
          items: [{ variantId: pin.variantId, quantity: 1 }],
        },
        expectedTotalMinor: 15000,
      }),
    )

    await send(s)

    const [mail] = await mailTo(to)
    expect(mail!.Text).toContain('PICKING UP MERCHANDISE')
    expect(mail!.Text).toContain('At the desk in hall A.')
    expect(mail!.Text).not.toContain('Merchandise is picked up at the convention')
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

  // "Sign in to see the order among your orders" holds only for an order on that account: one an
  // org moved to the address of an account stays off it.
  it('offers no sign-in to an account the order is not on, in its language still', async () => {
    const s = await shop()
    const account = await createAccount({ locale: 'en' })
    const placed = await s.place(buyer())
    await s.pay(placed)
    await send(s)
    await setColumn('orders', placed.orderId, 'email', account.email)
    await queueOrderEmail(s.t.id, s.edition, placed.orderId, 'order-confirmation', account.email)

    expect(await send(s)).toMatchObject({ sent: 1, failed: 0 })

    const [mail] = await mailTo(account.email)
    expect(mail!.Subject).toMatch(/^Your order \S+ for .+ is paid$/)
    expect(mail!.Text).toMatch(/See your order: \S+\/order#/)
    expect(mail!.Text).not.toMatch(/Sign in|OPOS account/)
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

// What order management tells a buyer (docs/specs/0006-order-management.md, Emails): the route
// that changes an order queues the email, and the outbox writes it from the order as it stands.
describe('the emails of order management', () => {
  it('tell the buyer the ticket holder and the merchandise as the order holds them now', async () => {
    const s = await shop('en')
    const to = buyer()
    const shirt = await addMerchandiseItem(s.t.id, s.edition, { name: 'T-shirt', stock: 5 })
    await offerWith(s.t.id, s.edition, s.standard, { itemIds: [shirt.id] })
    const placed = await s.place(to, {
      cart: {
        ticket: { ticketTypeId: s.standard },
        items: [{ variantId: shirt.variantId, quantity: 2 }],
      },
      holderName: 'Grace Hopper',
      expectedTotalMinor: 20000,
    })
    await s.pay(placed)
    await queueOrderEmail(s.t.id, s.edition, placed.orderId, 'order-holder-changed', to)
    await queueOrderEmail(s.t.id, s.edition, placed.orderId, 'order-variant-changed', to)

    expect(await send(s)).toMatchObject({ sent: 3, failed: 0 })

    const mails = await mailTo(to, 3)
    const holder = mails.find((mail) => mail.Subject.includes('ticket holder'))
    expect(holder!.Subject).toBe(`The ticket holder of your order ${placed.number} was changed`)
    expect(holder!.Text).toContain('Ticket holder: Grace Hopper')
    expect(holder!.Text).toContain('shop@seller.test')
    const variant = mails.find((mail) => mail.Subject.includes('merchandise'))
    expect(variant!.Subject).toBe(`The merchandise of your order ${placed.number} was changed`)
    expect(variant!.Text).toContain('2 × T-shirt')
    // A correction carries no QR code: the one the buyer has stays.
    for (const mail of [holder, variant]) expect(mail!.Text).not.toMatch(/[A-Z2-7]{32}/)
  })

  it('give the new address of an order its QR code and a link of its own, and the old one a notice', async () => {
    const s = await shop('en')
    const [old, moved] = [buyer(), buyer()]
    const placed = await s.place(old)
    await s.pay(placed)
    await send(s)
    // The order is under its new address when the two emails of the change are written.
    await setColumn('orders', placed.orderId, 'email', moved)
    await queueOrderEmail(s.t.id, s.edition, placed.orderId, 'order-email-changed', moved)
    await queueOrderEmail(s.t.id, s.edition, placed.orderId, 'order-email-replaced', old)

    expect(await send(s)).toMatchObject({ sent: 2, failed: 0 })

    const [toNew] = await mailTo(moved)
    expect(toNew!.Subject).toBe(
      `Your order ${placed.number} for ${s.name} is now under this email address`,
    )
    // The code the order carries when the email is written, as text and as a picture.
    expect(toNew!.Text).toMatch(/The QR code of the order \S+: [A-Z2-7]{32}/)
    expect(toNew!.HTML).toContain('<img src="cid:qr-code@opos"')
    const token = /\/order#([A-Za-z0-9_-]{43})/.exec(toNew!.Text)?.[1]
    expect(token).toBeDefined()
    const links = await storedRows('order_links', s.t.id)
    expect(links.map((link) => link.token_hash)).toContain(
      createHash('sha256').update(token!).digest('hex'),
    )
    const toOld = (await mailTo(old, 2)).find((mail) => mail.Subject.includes('moved'))
    expect(toOld!.Subject).toBe(
      `Your order ${placed.number} for ${s.name} was moved to another email address`,
    )
    expect(toOld!.Text).not.toMatch(/[A-Z2-7]{32}|\/orders\//)
  })

  // An email is written when it is sent, from the order as it then stands: one that would hand
  // the order over to an address the order has left is withdrawn instead.
  it('send no QR code and no link to an address the order left before its confirmation went out', async () => {
    const s = await shop('en')
    const [old, moved] = [buyer(), buyer()]
    const placed = await s.place(old)
    await s.pay(placed)
    // The org moves the order before the outbox has sent its confirmation.
    await request(app.getHttpServer())
      .put(`/editions/${s.edition}/orders/${placed.orderId}/email`)
      .use(session(s.t.head.token))
      .set('X-Tenant-Slug', s.t.slug)
      .send({ email: moved })
      .expect(200)

    expect(await send(s)).toMatchObject({ sent: 2, failed: 0 })

    const toOld = await mailTo(old)
    expect(toOld.map((mail) => mail.Subject)).toEqual([
      `Your order ${placed.number} for ${s.name} was moved to another email address`,
    ])
    expect(toOld[0]!.Text).not.toMatch(/[A-Z2-7]{32}|\/orders\//)
    const [toNew] = await mailTo(moved)
    expect(toNew!.Text).toMatch(/The QR code of the order \S+: [A-Z2-7]{32}/)
    // Withdrawn, the confirmation is never sent, and no link was made for it.
    const [confirmation] = (await s.emails()).filter((row) => row.kind === 'order-confirmation')
    expect(confirmation).toMatchObject({ recipient: old, sent_at: null })
    expect(confirmation!.withdrawn_at).not.toBeNull()
    expect(await send(s)).toMatchObject({ sent: 0, failed: 0 })
    expect(await storedRows('order_links', s.t.id)).toHaveLength(1)
    expect(await mailTo(old)).toHaveLength(1)
  })

  // Every email to the buyer is written from the order as it stands when it is sent: one still
  // queued for the address the order has left would tell that address the order as its new
  // holder has it. Only the notice of the change itself goes there.
  it('send nothing more of an order to the address it left, whatever was queued for it', async () => {
    const s = await shop('en')
    const [old, moved] = [buyer(), buyer()]
    const placed = await s.place(old, { holderName: 'Grace Hopper' })
    await s.pay(placed)
    expect(await send(s)).toMatchObject({ sent: 1, failed: 0 })
    const agent = request(app.getHttpServer())
    const org = (method: 'put' | 'patch', part: string, body: object) =>
      agent[method](`/editions/${s.edition}/orders/${placed.orderId}/${part}`)
        .use(session(s.t.head.token))
        .set('X-Tenant-Slug', s.t.slug)
        .send(body)
        .expect(200)
    // The notice of a corrected name still waits when the org moves the order and names the
    // ticket holder it passed to.
    await org('patch', 'holder', { holderName: 'Grace Hoper' })
    await org('put', 'email', { email: moved })
    await org('patch', 'holder', { holderName: 'Alan Turing' })
    // Whatever else was queued for the old address before the order left it.
    const waiting = [
      'order-variant-changed',
      'order-expired',
      'payment-under-review',
      'payment-not-needed',
      'order-declined',
      'order-canceled',
    ]
    for (const kind of waiting) {
      await queueOrderEmail(s.t.id, s.edition, placed.orderId, kind, old)
    }
    // An email to an org goes to the org's own address, never the order's: it is not judged so.
    await queueOrderEmail(s.t.id, s.edition, placed.orderId, 'needs-review', s.t.head.email)

    // The notice to each address, the new holder's name to the new one, and the org's alert.
    expect(await send(s)).toMatchObject({ sent: 4, failed: 0 })

    const toOld = await mailTo(old, 2)
    expect(toOld.map((mail) => mail.Subject).sort()).toEqual(
      [
        `Your order ${placed.number} for ${s.name} is paid`,
        `Your order ${placed.number} for ${s.name} was moved to another email address`,
      ].sort(),
    )
    for (const mail of toOld) expect(mail.Text).not.toContain('Alan Turing')
    const toNew = await mailTo(moved, 2)
    expect(toNew.some((mail) => mail.Text.includes('Ticket holder: Alan Turing'))).toBe(true)
    expect(await mailTo(s.t.head.email)).toHaveLength(1)
    const queuedForOld = (await s.emails()).filter(
      (row) => row.recipient === old && row.sent_at === null,
    )
    expect(queuedForOld.map((row) => row.kind).sort()).toEqual(
      ['order-holder-changed', ...waiting].sort(),
    )
    for (const row of queuedForOld) expect(row.withdrawn_at).not.toBeNull()
    // Withdrawn, they are not tried again.
    expect(await send(s)).toMatchObject({ sent: 0, failed: 0 })
    expect(await mailTo(old, 2)).toHaveLength(2)
  })

  // A confirmation says the order is paid and hands its QR code over: of an order canceled
  // before it went out, neither is true any more.
  it('send no confirmation and no QR code of an order canceled before they went out', async () => {
    const s = await shop('en')
    const [to, moved] = [buyer(), buyer()]
    const org = (path: string) =>
      request(app.getHttpServer())
        .post(`/editions/${s.edition}/orders/${path}`)
        .use(session(s.t.head.token))
        .set('X-Tenant-Slug', s.t.slug)
    const placed = await s.place(to)
    await s.pay(placed)
    // The org cancels the order before the outbox has sent its confirmation.
    await org(`${placed.orderId}/cancel`).send({ reason: 'Asked to' }).expect(200)
    // Another order is moved to a new address, and canceled before that address was told.
    const other = await s.place(buyer())
    await s.pay(other)
    await setColumn('orders', other.orderId, 'email', moved)
    await queueOrderEmail(s.t.id, s.edition, other.orderId, 'order-email-changed', moved)
    await org(`${other.orderId}/cancel`).send({ reason: 'Asked to' }).expect(200)

    expect(await send(s)).toMatchObject({ sent: 2, failed: 0 })

    for (const address of [to, moved]) {
      const mails = await mailTo(address)
      expect(mails.map((mail) => mail.Subject)).toEqual([
        expect.stringMatching(/^Your order \S+ for .+ was canceled$/),
      ])
      expect(mails[0]!.Text).not.toMatch(/\b[A-Z2-7]{32}\b|\/order#/)
    }
    // Withdrawn, they are never sent, and no link was made for them.
    const unsent = (await s.emails()).filter((row) => row.kind !== 'order-canceled')
    expect(unsent.map((row) => row.kind).sort()).toEqual([
      'order-confirmation',
      'order-confirmation',
      'order-email-changed',
    ])
    for (const row of unsent) {
      expect(row.sent_at).toBeNull()
      expect(row.withdrawn_at).not.toBeNull()
    }
    expect(await storedRows('order_links', s.t.id)).toHaveLength(0)
    expect(await send(s)).toMatchObject({ sent: 0, failed: 0 })
  })

  it('tell the buyer of a declined payment where the money is, and of a canceled order that its QR code is no longer valid', async () => {
    const s = await shop('en')
    const [declined, canceled] = [buyer(), buyer()]
    const review = await s.place(declined)
    await s.pay(review, 9000)
    const paid = await s.place(canceled)
    await s.pay(paid)
    await send(s)
    await queueOrderEmail(s.t.id, s.edition, review.orderId, 'order-declined', declined)
    await queueOrderEmail(s.t.id, s.edition, paid.orderId, 'order-canceled', canceled)

    expect(await send(s)).toMatchObject({ sent: 2, failed: 0 })

    const toDeclined = (await mailTo(declined, 2)).find((mail) => mail.Subject.includes('declined'))
    expect(toDeclined!.Subject).toBe(`The payment for your order ${review.number} was declined`)
    // Where the money is, as the provider's module words it.
    expect(toDeclined!.Text).toContain(fake().moneyWith('convention').en)
    expect(toDeclined!.Text).toContain('shop@seller.test')
    const toCanceled = (await mailTo(canceled, 2)).find((mail) => mail.Subject.includes('canceled'))
    expect(toCanceled!.Subject).toBe(`Your order ${paid.number} for ${s.name} was canceled`)
    expect(toCanceled!.Text).toContain('Its QR code is no longer valid')
  })
})

// docs/specs/0006-order-management.md, F4: an org reads what an email said, and never what
// hands the order over.
describe('what a sent email said', () => {
  /** A text by its lines, however a mail server ends them. */
  const lines = (text: unknown) => String(text).trim().split(/\r?\n/)

  it('is kept as it went out, without the QR code and the token of the order link', async () => {
    const s = await shop('en')
    const to = buyer()
    const placed = await s.place(to)
    await s.pay(placed)

    await send(s)

    const [mail] = await mailTo(to)
    const code = /The QR code of the order \S+: ([A-Z2-7]{32})/.exec(mail!.Text)![1]!
    const token = /\/order#([A-Za-z0-9_-]{43})/.exec(mail!.Text)![1]!
    const [kept] = await s.emails()
    expect(kept!.subject).toBe(mail!.Subject)
    expect(lines(kept!.body)).toEqual(
      lines(mail!.Text.replaceAll(code, '[…]').replaceAll(token, '[…]')),
    )
    expect(kept!.body).toContain(`The QR code of the order ${placed.number}: […]`)
    expect(kept!.body).toMatch(/See your order: \S+\/order#\[…\]/)
    // Neither is anywhere in what is kept of the email.
    expect(JSON.stringify(kept)).not.toContain(code)
    expect(JSON.stringify(kept)).not.toContain(token)
  })

  // Whether an address has an account is told to nobody: neither by a sentence of the email
  // nor by the language it went out in.
  it('is kept in the convention’s language and with no word of an account, whoever it went to', async () => {
    const s = await shop()
    const account = await createAccount({ locale: 'en' })
    const [visitor, owner] = [await s.place(buyer()), await s.place(account.email)]
    await s.pay(visitor)
    await s.pay(owner)

    await send(s)

    const [mail] = await mailTo(account.email)
    expect(mail!.Subject).toBe(`Your order ${owner.number} for ${s.name} is paid`)
    expect(mail!.Text).toMatch(/This email address has an OPOS account[^]*Sign in: \S+\/login/)
    const kept = await s.emails()
    const [toVisitor, toOwner] = [visitor, owner].map((placed) =>
      kept.find((email) => email.order_id === placed.orderId)!,
    )
    expect(toOwner!.subject).toBe(
      `Twoje zamówienie ${owner.number} w sklepie konwentu ${s.name} jest opłacone`,
    )
    // The amount is written as the language writes it, with a space that does not break.
    expect(toOwner!.body).toMatch(/Razem: 100,00\szł/)
    expect(toOwner!.body).toContain(`Kod QR zamówienia ${owner.number}: […]`)
    expect(toOwner!.body).not.toMatch(/Sign in|Zaloguj|account|kont[oa]/i)
    // But for the order's number, the two say the same.
    expect(lines(String(toOwner!.body).replaceAll(owner.number, visitor.number))).toEqual(
      lines(toVisitor!.body),
    )
  })

  it('is kept whole for an email that hands nothing over', async () => {
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
    const [kept] = await s.emails()
    expect(kept!.subject).toBe(`Your order ${placed.number} for ${s.name} has expired`)
    expect(lines(kept!.body)).toEqual(lines(mail!.Text))
  })

  it('is kept of no email that did not go out', async () => {
    const s = await shop('en')
    await s.pay(await s.place(buyer()))
    vi.spyOn(app.get(MailService), 'sendOrderEmail').mockRejectedValueOnce(
      new Error('the SMTP server is down'),
    )

    expect(await send(s)).toMatchObject({ sent: 0, failed: 1 })

    expect(await s.emails()).toMatchObject([{ sent_at: null, subject: null, body: null }])
  })

  it('leaves out the new QR code and link of a changed email, and the code of a reminder', async () => {
    const s = await shop('en')
    const [to, moved] = [buyer(), buyer()]
    const placed = await s.place(to)
    await s.pay(placed)
    await send(s)
    // The order is under its new address when the emails are written.
    await setColumn('orders', placed.orderId, 'email', moved)
    for (const kind of ['order-email-changed', 'pre-edition-reminder', 'order-link']) {
      await queueOrderEmail(s.t.id, s.edition, placed.orderId, kind, moved)
    }

    await send(s)

    const mails = await mailTo(moved, 3)
    const secrets = mails.flatMap((mail) => [
      ...mail.Text.matchAll(/\b[A-Z2-7]{32}\b/g),
      ...mail.Text.matchAll(/\/order#([A-Za-z0-9_-]{43})/g),
    ])
    // The code went out twice and a link of its own twice, to the new address.
    expect(secrets).toHaveLength(4)
    const kept = JSON.stringify(await s.emails())
    for (const secret of secrets) expect(kept).not.toContain(secret[1] ?? secret[0])
    expect(
      (await s.emails())
        .filter((email) => email.recipient === moved)
        .every((email) => String(email.body).includes('[…]')),
    ).toBe(true)
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

  // A run takes its emails one after another: the last of a long one is claimed minutes after
  // the run began, and is this process's alone from then, not from the run's beginning.
  it('keeps an email claimed late in a long run from a run that begins meanwhile', async () => {
    const s = await shop('en')
    const to = buyer()
    await s.pay(await s.place(to))
    const [queued] = await s.emails()
    const began = new Date(Date.now() - 6 * MINUTE)
    await setColumn('order_emails', String(queued!.id), 'next_attempt_at', began.toISOString())
    const mail = app.get(MailService)
    const sendOrderEmail = mail.sendOrderEmail.bind(mail)
    let meanwhile: { sent: number; failed: number } | undefined
    // While the email is being sent, another process begins a run of its own.
    vi.spyOn(mail, 'sendOrderEmail').mockImplementationOnce(async (composed) => {
      meanwhile = await send(s)
      return sendOrderEmail(composed)
    })

    expect(await send(s, began)).toMatchObject({ sent: 1, failed: 0 })

    expect(meanwhile).toEqual({ sent: 0, failed: 0 })
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
