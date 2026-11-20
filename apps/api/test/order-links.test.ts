import { createHash } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { type OpenedOrderLink } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTE_RATE_LIMITS } from '../src/common/rate-limit/route-rate-limit'
import { OrderEmailsOutbox } from '../src/modules/checkout/order-emails.service'
import { createApp } from './app'
import { deleteCreatedAccounts, testEmail } from './auth'
import { deleteMail, waitForMail } from './mailpit'
import { type OrderDesk, orderDesk } from './order-desk'
import {
  addMerchandiseItem,
  addOrderLinkWithToken,
  closeTenantDb,
  deleteCreatedTenants,
  offerWith,
  setCatalogSettings,
  setColumn,
  setPublished,
  storedRows,
  suspend,
} from './tenants'

// The order link (docs/specs/0009-buyer-self-service.md, K1-K7): an emailed link that opens one
// order without a sign-in, until 30 days after its edition ends. Its token travels in a request's
// body; an expired one shows nothing of the order and has a fresh link sent to the order's email.

let app: NestExpressApplication
const addresses: string[] = []

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
})

afterAll(async () => {
  await Promise.all(addresses.map((address) => deleteMail(address)))
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

/** Each test asks from an address of its own: the routes of a link are counted by address. */
let address = 0
const from = () => `198.51.100.${(address += 1) % 250}`

const open = (token: string, ip = from()) =>
  request(app.getHttpServer())
    .post('/public/order-links/open')
    .set('X-Forwarded-For', ip)
    .send({ token })
const renew = (token: string, ip = from()) =>
  request(app.getHttpServer())
    .post('/public/order-links/renew')
    .set('X-Forwarded-For', ip)
    .send({ token })
const hashOf = (text: string) => createHash('sha256').update(text).digest('hex')
/** A token nobody made, in the shape of a real one. */
const unmade = () => Buffer.from(hashOf(`${Math.random()}`), 'hex').toString('base64url')
const buyer = () => {
  const email = testEmail('buyer')
  addresses.push(email)
  return email
}
const linkEmails = async (d: OrderDesk, orderId: string) =>
  (await d.emails(orderId)).filter(([kind]) => kind === 'order-link')

describe('an order link', () => {
  it('opens its order: the lines, the status, the QR code and the pick-up information', async () => {
    const d = await orderDesk(app)
    const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 5 })
    await offerWith(d.t.id, d.edition, d.standard, { itemIds: [pin.id] })
    await setCatalogSettings(d.t.id, d.edition, { pickupInformation: 'At the desk in hall A.' })
    const email = buyer()
    const placed = await d.paid({
      email,
      emailConfirmation: email,
      cart: {
        ticket: { ticketTypeId: d.standard },
        items: [{ variantId: pin.variantId, quantity: 2 }],
      },
      expectedTotalMinor: 20000,
    })
    const token = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId)

    const res = await open(token).expect(200)

    const opened = res.body as OpenedOrderLink
    expect(opened).toMatchObject({
      state: 'valid',
      order: {
        number: placed.number,
        status: 'paid',
        totalMinor: 20000,
        currency: 'PLN',
        convention: { slug: d.t.slug },
        edition: { slug: d.slug },
        pickupInformation: 'At the desk in hall A.',
        lines: [
          { kind: 'ticket', name: 'Standard', quantity: 1, amountMinor: 10000 },
          { kind: 'merchandise', name: 'Pin', quantity: 2, amountMinor: 10000 },
        ],
      },
    })
    // The QR code the order carries, opened for the buyer who holds the link.
    const [code] = await storedRows('order_qr_codes', d.t.id)
    const qrCode = opened.state === 'valid' ? opened.order.qrCode : null
    expect(qrCode).toMatch(/^[A-Z2-7]{32}$/)
    expect(hashOf(qrCode!)).toBe(code!.code_hash)
    // The page tells no email address and nothing of the ticket holder.
    expect(JSON.stringify(res.body)).not.toContain(email)
    expect(JSON.stringify(res.body)).not.toContain('Ada Lovelace')
  })

  it('answers only that it expired for an expired link', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    const token = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId, 'expired')

    const res = await open(token).expect(200)

    expect(res.body).toEqual({ state: 'expired' })
  })

  it('shows a canceled order with its status and no QR code', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    const token = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId)
    await d.head('post', `/orders/${placed.orderId}/cancel`, { reason: 'Asked to' }).expect(200)

    const res = await open(token).expect(200)

    expect(res.body).toMatchObject({ state: 'valid', order: { status: 'canceled', qrCode: null } })
  })

  it('is unknown for a token nobody made and for a link a changed email ended', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    const ended = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId, 'ended')

    const [unknown, gone] = [await open(unmade()), await open(ended)]

    expect(unknown.status).toBe(404)
    expect(unknown.body).toMatchObject({ code: 'request.not-found' })
    expect([gone.status, gone.body]).toEqual([unknown.status, unknown.body])
  })

  it('is unknown while its convention is suspended or its edition is not published', async () => {
    const [suspended, unpublished] = [await orderDesk(app), await orderDesk(app)]
    const tokens: string[] = []
    for (const d of [suspended, unpublished]) {
      const placed = await d.paid()
      tokens.push(await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId))
    }
    await suspend(suspended.t.id)
    await setPublished(unpublished.edition, false)

    for (const token of tokens) {
      const res = await open(token)
      expect(res.status).toBe(404)
      expect(res.body).toMatchObject({ code: 'request.not-found' })
    }
  })

  it.each(['', 'short', 'x'.repeat(201)])(
    'refuses the token %j as no token at all',
    async (token) => {
      const res = await open(token).expect(400)

      expect(res.body).toMatchObject({ code: 'request.invalid' })
    },
  )

  it('is opened only so often from one address', async () => {
    const ip = from()
    const { limit } = ROUTE_RATE_LIMITS.orderLinkOpens
    for (let tried = 0; tried < limit; tried += 1) await open(unmade(), ip).expect(404)

    const res = await open(unmade(), ip)

    expect(res.status).toBe(429)
    expect(res.body).toMatchObject({ code: 'request.rate-limited' })
  })
})

describe('a fresh order link', () => {
  it('is sent to the order’s email for an expired link, and opens the order', async () => {
    const d = await orderDesk(app)
    const email = buyer()
    const placed = await d.paid({ email, emailConfirmation: email })
    // The confirmation is sent first, so the mailbox then holds the fresh link alone as its second.
    await app.get(OrderEmailsOutbox).run(new Date(), { tenantId: d.t.id })
    const expired = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId, 'expired')

    const res = await renew(expired).expect(204)

    expect(res.body).toEqual({})
    expect(await linkEmails(d, placed.orderId)).toEqual([['order-link', email]])
    expect(await app.get(OrderEmailsOutbox).run(new Date(), { tenantId: d.t.id })).toMatchObject({
      sent: 1,
    })
    const mails = await waitForMail(email, 2)
    const mail = mails.find((sent) => !/[A-Z2-7]{32}/.test(sent.Text))!
    const token = /\/order#([A-Za-z0-9_-]{43})/.exec(mail.Text)?.[1]
    expect(token).toBeDefined()
    // It carries a link and no QR code: the code is on the page the link opens.
    expect(mail.Text).not.toMatch(/[A-Z2-7]{32}/)
    expect((await open(token!).expect(200)).body).toMatchObject({
      state: 'valid',
      order: { number: placed.number },
    })
    // The expired link stays expired.
    expect((await open(expired).expect(200)).body).toEqual({ state: 'expired' })
  })

  it('opens for 30 days from its sending once its edition is long over', async () => {
    const d = await orderDesk(app)
    const email = buyer()
    const placed = await d.paid({ email, emailConfirmation: email })
    await app.get(OrderEmailsOutbox).run(new Date(), { tenantId: d.t.id })
    await setColumn('editions', d.edition, 'starts_at', '2020-05-01T08:00:00Z')
    await setColumn('editions', d.edition, 'ends_at', '2020-05-03T18:00:00Z')
    const expired = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId, 'expired')
    const before = Date.now()

    await renew(expired).expect(204)
    await app.get(OrderEmailsOutbox).run(new Date(), { tenantId: d.t.id })

    // The link made last is the fresh one.
    const time = (value: unknown) => new Date(String(value)).getTime()
    const links = (await storedRows('order_links', d.t.id)).sort(
      (a, b) => time(a.created_at) - time(b.created_at),
    )
    const newest = time(links.at(-1)!.expires_at)
    const DAY = 24 * 3_600_000
    expect(newest).toBeGreaterThanOrEqual(before + 30 * DAY)
    expect(newest).toBeLessThan(Date.now() + 30 * DAY + 60_000)
  })

  it('answers alike for a link that still opens, an ended one and a token nobody made, and sends nothing', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    const valid = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId)
    const ended = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId, 'ended')
    const expired = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId, 'expired')

    const answers = []
    for (const token of [expired, valid, ended, unmade()]) {
      const res = await renew(token)
      answers.push([res.status, res.body, res.headers['content-type']])
    }

    expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1)
    expect(answers[0]![0]).toBe(204)
    // Only the expired one had a fresh link queued.
    expect(await linkEmails(d, placed.orderId)).toHaveLength(1)
  })

  it('is sent once an hour for an order, however often it is asked for', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    const expired = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId, 'expired')

    await renew(expired).expect(204)
    await renew(expired).expect(204)

    expect(await linkEmails(d, placed.orderId)).toHaveLength(1)
    // An hour on, the buyer may ask again.
    const [queued] = (await storedRows('order_emails', d.t.id)).filter(
      (row) => row.kind === 'order-link',
    )
    await setColumn('order_emails', String(queued!.id), 'queued_at', '2020-01-01T00:00:00Z')
    await renew(expired).expect(204)
    expect(await linkEmails(d, placed.orderId)).toHaveLength(2)
  })

  it('is sent once however many ask for it at the same moment', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    const expired = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId, 'expired')

    const answers = await Promise.all(Array.from({ length: 5 }, () => renew(expired)))

    expect(answers.map((res) => res.status)).toEqual([204, 204, 204, 204, 204])
    expect(await linkEmails(d, placed.orderId)).toHaveLength(1)
  })

  it('sends nothing for a suspended convention, and answers the same', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    const expired = await addOrderLinkWithToken(d.t.id, d.edition, placed.orderId, 'expired')
    await suspend(d.t.id)

    await renew(expired).expect(204)

    expect(await linkEmails(d, placed.orderId)).toEqual([])
  })

  it('is asked for only so often from one address', async () => {
    const ip = from()
    const { limit } = ROUTE_RATE_LIMITS.orderLinkRenewals
    for (let tried = 0; tried < limit; tried += 1) await renew(unmade(), ip).expect(204)

    const res = await renew(unmade(), ip)

    expect(res.status).toBe(429)
    expect(res.body).toMatchObject({ code: 'request.rate-limited' })
  })
})
