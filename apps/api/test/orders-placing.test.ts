import { createHash } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import {
  MAX_AMOUNT_MINOR,
  MAX_ORDER_TOTAL_MINOR,
  MAX_UNPAID_ORDERS,
  type Offer,
  ORDER_NUMBER_ALPHABET,
  type PlacedOrder,
} from '@opos/contract'
import { open, orderQrCodeOf, sealingKey } from '@opos/db/sealed'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { STAND_IN_TOKEN } from '../src/modules/checkout/bot-check'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import {
  addAddOn,
  addConsent,
  addCustomField,
  addDocumentVersion,
  addEdition,
  addMerchandiseItem,
  addOrder,
  addTicketType,
  closeTenantDb,
  deleteCreatedTenants,
  makeShopReady,
  member,
  type Member,
  offerWith,
  openShop,
  setCatalogSettings,
  setColumn,
  setPublished,
  storedRows,
  suspend,
  tenantWithHead,
} from './tenants'

// Placing an order (docs/specs/0004-checkout-and-orders.md, O1-O13): the API enforces every rule
// the shop displays, so nothing is bought by going around the page. A visitor places one under an
// email typed twice, an account under its own.

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
const ahead = (minutes: number) => new Date(Date.now() + minutes * MINUTE).toISOString()

type Row = Record<string, unknown>

/** A moment as a stored row holds it: text, as the database writes it. */
const moment = (stored: unknown) => new Date(String(stored)).getTime()

/** A published edition with an open shop and one ticket type at 100.00. */
async function shop(ticketType: Parameters<typeof addTicketType>[2] = {}) {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id)
  await setPublished(edition, true)
  const ready = await makeShopReady(t.id, edition)
  await openShop(t.id, edition)
  const standard = await addTicketType(t.id, edition, { name: 'Standard', ...ticketType })
  const editions = await request(app.getHttpServer()).get(`/public/tenants/${t.slug}/editions`)
  const slug = (editions.body as { slug: string }[])[0]!.slug
  const path = `/public/tenants/${t.slug}/editions/${slug}/shop/orders`
  /** The body of a visitor's order for the ticket type, as the page would send it. */
  const order = (changes: Row = {}) => ({
    cart: { ticket: { ticketTypeId: standard } },
    holderName: 'Ada',
    ageBand: 'adult',
    email: 'buyer@example.test',
    emailConfirmation: 'buyer@example.test',
    providerConsentAccepted: true,
    expectedTotalMinor: 10000,
    botCheckToken: STAND_IN_TOKEN,
    ...changes,
  })
  const place = (changes: Row = {}) => request(app.getHttpServer()).post(path).send(order(changes))
  const orders = () => storedRows('orders', t.id)
  return { t, edition, slug, path, standard, ready, order, place, orders }
}

type Shop = Awaited<ReturnType<typeof shop>>

const placed = (res: { body: unknown }) => res.body as PlacedOrder

describe('a placed order', () => {
  it('awaits its payment, holds what it took for thirty minutes and keeps the prices it was placed at', async () => {
    const s = await shop({ supporterPrices: [25000] })
    const room = await addAddOn(s.t.id, s.edition, { name: 'Room', amountMinor: 2500 })
    const pin = await addMerchandiseItem(s.t.id, s.edition, { name: 'Pin', stock: 5 })
    await offerWith(s.t.id, s.edition, s.standard, { addOnIds: [room], itemIds: [pin.id] })
    const before = Date.now()

    const res = await s
      .place({
        cart: {
          ticket: { ticketTypeId: s.standard, supporterPriceMinor: 25000 },
          addOnIds: [room],
          items: [{ variantId: pin.variantId, quantity: 2 }],
        },
        holderName: ' Ada Lovelace ',
        email: 'Buyer@Example.test',
        emailConfirmation: 'buyer@example.TEST',
        expectedTotalMinor: 25000 + 2500 + 2 * 5000,
      })
      .expect(201)

    const answer = placed(res)
    expect(answer).toEqual({
      orderId: expect.any(String) as string,
      number: expect.stringMatching(new RegExp(`^[${ORDER_NUMBER_ALPHABET}]{10}$`)) as string,
      status: 'awaiting-payment',
      totalMinor: 37500,
      resultToken: expect.any(String) as string,
    })
    // At least 128 random bits, and nothing of it stored as it is.
    expect(answer.resultToken.length).toBeGreaterThanOrEqual(22)
    const [order] = await s.orders()
    expect(order).toMatchObject({
      id: answer.orderId,
      number: answer.number,
      status: 'awaiting-payment',
      email: 'buyer@example.test',
      holder_name: 'Ada Lovelace',
      age_band: 'adult',
      total_minor: 37500,
      currency: 'PLN',
      holds: true,
      paid_at: null,
      guardian_consent_acknowledged_at: null,
    })
    expect(JSON.stringify(order)).not.toContain(answer.resultToken)
    const holdEnds = moment(order!.hold_ends_at)
    expect(holdEnds).toBeGreaterThanOrEqual(before + 30 * MINUTE)
    expect(holdEnds).toBeLessThanOrEqual(Date.now() + 30 * MINUTE)
    expect(moment(order!.provider_consent_accepted_at)).toBeGreaterThanOrEqual(before)

    const lines = await storedRows('order_lines', s.t.id)
    expect(
      lines.map((line) => [line.kind, line.quantity, line.unit_amount_minor, line.amount_minor]),
    ).toEqual(
      expect.arrayContaining([
        ['ticket', 1, 25000, 25000],
        ['add_on', 1, 2500, 2500],
        ['merchandise', 2, 5000, 10000],
      ]),
    )
    expect(lines).toHaveLength(3)
    // No payment yet: no QR code and no email.
    expect(await storedRows('order_qr_codes', s.t.id)).toEqual([])
    expect(await storedRows('order_emails', s.t.id)).toEqual([])
  })

  it('keeps the answers and the consents of its ticket holder, each consent with the version accepted', async () => {
    const s = await shop()
    const city = await addCustomField(s.t.id, s.edition, { label: 'City', isRequired: true })
    const fandom = await addCustomField(s.t.id, s.edition, { label: 'Fandom' })
    const terms = await addConsent(s.t.id, s.edition, { documentId: s.ready.terms.id })
    const news = await addConsent(s.t.id, s.edition, { text: 'News', isRequired: false })

    await s
      .place({
        customFieldAnswers: [{ fieldId: city, answer: ' Poznań ' }],
        consents: [{ consentId: terms, documentVersionId: s.ready.terms.versionIds[0] }],
      })
      .expect(201)

    expect(await storedRows('order_custom_field_answers', s.t.id)).toMatchObject([
      { custom_field_id: city, answer: 'Poznań' },
    ])
    const consents = await storedRows('order_consents', s.t.id)
    expect(consents).toMatchObject([
      { consent_id: terms, document_version_id: s.ready.terms.versionIds[0] },
    ])
    expect(moment(consents[0]!.accepted_at)).toBeGreaterThan(Date.now() - MINUTE)
    expect(JSON.stringify(consents)).not.toContain(news)
    expect(fandom).toBeDefined()
  })

  it('with nothing to pay is paid at once: a QR code, its confirmation queued, no provider consent', async () => {
    const s = await shop({ amountMinor: 0 })

    const res = await s.place({ expectedTotalMinor: 0, providerConsentAccepted: false }).expect(201)

    expect(placed(res)).toMatchObject({ status: 'paid', totalMinor: 0 })
    const [order] = await s.orders()
    expect(order).toMatchObject({
      status: 'paid',
      holds: true,
      hold_ends_at: null,
      provider_consent_accepted_at: null,
    })
    expect(moment(order!.paid_at)).toBeGreaterThan(Date.now() - MINUTE)
    const codes = await storedRows('order_qr_codes', s.t.id)
    expect(codes).toHaveLength(1)
    // Found by its hash, and kept sealed: the code itself is in neither column, and opens with
    // the API's key for its own row alone.
    expect(String(codes[0]!.code)).toMatch(/^v1\./)
    const code = open(
      sealingKey(loadEnv().PAYMENT_CREDENTIALS_KEY),
      String(codes[0]!.code),
      orderQrCodeOf(s.t.id, String(codes[0]!.id)),
    )
    expect(code).toMatch(/^[A-Z2-7]{32}$/)
    expect(codes[0]!.code_hash).toBe(createHash('sha256').update(code).digest('hex'))
    expect(await storedRows('order_qr_code_orders', s.t.id)).toMatchObject([
      { order_id: order!.id, qr_code_id: codes[0]!.id },
    ])
    expect(await storedRows('order_emails', s.t.id)).toMatchObject([
      { kind: 'order-confirmation', recipient: 'buyer@example.test', sent_at: null },
    ])
    expect(await storedRows('payment_attempts', s.t.id)).toEqual([])
  })

  it('of merchandise alone has no ticket, no age band and no custom field', async () => {
    const s = await shop()
    await addCustomField(s.t.id, s.edition, { label: 'City', isRequired: true })
    const pin = await addMerchandiseItem(s.t.id, s.edition, { stock: 5 })
    const alone = {
      cart: { ticket: null, items: [{ variantId: pin.variantId, quantity: 1 }] },
      ageBand: null,
      expectedTotalMinor: 5000,
    }

    // Merch-only orders are off until the edition turns them on.
    const off = await s.place(alone).expect(409)
    expect(off.body).toMatchObject({ code: 'order.unavailable', params: { kind: 'merch-only' } })

    await setCatalogSettings(s.t.id, s.edition, { merchOnlyEnabled: true })
    await s.place(alone).expect(201)
    expect(await s.orders()).toMatchObject([{ age_band: null, total_minor: 5000 }])
    expect(await storedRows('order_lines', s.t.id)).toMatchObject([{ kind: 'merchandise' }])

    for (const changes of [
      { ageBand: 'adult' },
      { customFieldAnswers: [] as object[], ageBand: 'teen' },
    ]) {
      await s.place({ ...alone, ...changes }).expect(400)
    }
  })

  // Nobody has to be named: the address is all an order needs of its buyer.
  it('is placed with no name of the ticket holder, left out or blank', async () => {
    const s = await shop()

    await s.place({ holderName: undefined }).expect(201)
    await s.place({ holderName: '   ' }).expect(201)

    expect(await s.orders()).toMatchObject([{ holder_name: '' }, { holder_name: '' }])
    await s.place({ holderName: 'n'.repeat(201) }).expect(400)
  })

  it('has a number of its own each time', async () => {
    const s = await shop()
    const numbers = new Set<string>()

    for (const email of ['a@example.test', 'b@example.test', 'c@example.test']) {
      numbers.add(placed(await s.place({ email, emailConfirmation: email }).expect(201)).number)
    }

    expect(numbers.size).toBe(3)
  })
})

describe('what the shop displays, broken through the API alone', () => {
  const nothingPlaced = async (s: Shop) => expect(await s.orders()).toEqual([])

  it('places nothing outside the sale window, nor of a hidden ticket type', async () => {
    const later = await shop({ saleStartsAt: ahead(60) })
    const res = await later.place().expect(409)
    expect(res.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'ticket-type', id: later.standard },
    })
    await nothingPlaced(later)

    const hidden = await shop({ hidden: true })
    await hidden.place().expect(409)
    await nothingPlaced(hidden)
  })

  it('places nothing for an age band the ticket type does not allow', async () => {
    const s = await shop({ ageBands: ['adult'] })

    const res = await s.place({ ageBand: 'child' }).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid', params: { field: 'ageBand' } })
    await s.place({ ageBand: null }).expect(400)
    await nothingPlaced(s)
  })

  it('places nothing of a hidden product, a variant that does not exist or more than an order may take', async () => {
    const s = await shop()
    const pin = await addMerchandiseItem(s.t.id, s.edition, { name: 'Pin', stock: 50 })
    const gone = await addMerchandiseItem(s.t.id, s.edition, { name: 'Gone', hidden: true })
    const other = await addMerchandiseItem(s.t.id, s.edition, { name: 'Not offered' })
    const room = await addAddOn(s.t.id, s.edition, { hidden: true })
    await offerWith(s.t.id, s.edition, s.standard, {
      addOnIds: [room],
      itemIds: [pin.id, gone.id],
    })
    const withItems = (variantId: string, quantity: number) => ({
      cart: { ticket: { ticketTypeId: s.standard }, items: [{ variantId, quantity }] },
      expectedTotalMinor: 10000 + quantity * 5000,
    })

    for (const body of [
      withItems(gone.variantId, 1),
      withItems(other.variantId, 1),
      // The item's limit an order is five.
      withItems(pin.variantId, 6),
      withItems('0198c1a0-0000-7000-8000-000000000001', 1),
      { cart: { ticket: { ticketTypeId: s.standard }, addOnIds: [room] } },
    ]) {
      const res = await s.place(body).expect(409)
      expect(res.body).toMatchObject({ code: 'order.unavailable' })
    }
    await nothingPlaced(s)
    await s.place(withItems(pin.variantId, 5)).expect(201)
  })

  it('places nothing without an answer to a required field, or with an answer to a field of another edition', async () => {
    const s = await shop()
    const other = await shop()
    await addCustomField(s.t.id, s.edition, { label: 'City', isRequired: true })
    const theirs = await addCustomField(other.t.id, other.edition)

    const missing = await s.place().expect(400)
    expect(missing.body).toMatchObject({ params: { field: 'customFieldAnswers' } })
    await s.place({ customFieldAnswers: [{ fieldId: theirs, answer: 'x' }] }).expect(400)
    await nothingPlaced(s)
  })

  it('places nothing without every required consent, naming the one that is missing', async () => {
    const s = await shop()
    const terms = await addConsent(s.t.id, s.edition, { text: 'Terms' })
    const news = await addConsent(s.t.id, s.edition, { text: 'News', isRequired: false })

    const accepted = (consentId: string) => ({ consentId, documentVersionId: null })

    const res = await s.place({ consents: [accepted(news)] }).expect(422)
    expect(res.body).toMatchObject({ code: 'order.consent-missing', params: { consent: terms } })

    // The provider's own consent is required too while there is something to pay.
    const provider = await s
      .place({ consents: [accepted(terms)], providerConsentAccepted: false })
      .expect(422)
    expect(provider.body).toMatchObject({
      code: 'order.consent-missing',
      params: { consent: 'provider' },
    })
    // A consent named twice, or one the edition does not ask for, is no order of the page.
    await s.place({ consents: [accepted(terms), accepted(terms)] }).expect(400)
    await s.place({ consents: [accepted(terms), accepted(s.standard)] }).expect(400)
    await nothingPlaced(s)
    await s.place({ consents: [accepted(terms)] }).expect(201)
  })

  // An order attests what its buyer was shown: a consent comes with the version of its document
  // that was on the page, and one that is no longer the newest is accepted again first.
  it('places nothing with a consent whose document changed since the buyer was shown it', async () => {
    const s = await shop()
    const terms = await addConsent(s.t.id, s.edition, { documentId: s.ready.terms.id })
    const news = await addConsent(s.t.id, s.edition, { text: 'News', isRequired: false })
    const offer = (await request(app.getHttpServer()).get(s.path.replace(/\/orders$/, '')))
      .body as Offer
    const shown = offer.consents.map((consent) => ({
      consentId: consent.id,
      documentVersionId: consent.documentVersionId,
    }))
    expect(shown).toEqual([
      { consentId: terms, documentVersionId: s.ready.terms.versionIds[0] },
      { consentId: news, documentVersionId: null },
    ])
    // The org publishes a new version while the buyer is at the checkout.
    const newer = await addDocumentVersion(s.t.id, s.edition, s.ready.terms.id)

    const res = await s.place({ consents: shown }).expect(409)
    expect(res.body).toMatchObject({ code: 'order.consent-changed', params: { consent: terms } })
    // Nor with a version the consent never had: none for one that links a document, one for a
    // consent that links none.
    const none = await s.place({ consents: [{ consentId: terms, documentVersionId: null }] })
    expect(none.status).toBe(409)
    expect(none.body).toMatchObject({ code: 'order.consent-changed', params: { consent: terms } })
    const foreign = await s.place({
      consents: [
        { consentId: terms, documentVersionId: newer },
        { consentId: news, documentVersionId: s.ready.privacy.versionIds[0] },
      ],
    })
    expect(foreign.status).toBe(409)
    expect(foreign.body).toMatchObject({ code: 'order.consent-changed', params: { consent: news } })
    await nothingPlaced(s)
    expect(await storedRows('order_consents', s.t.id)).toEqual([])

    // Shown the new version, the buyer accepts it, and the order keeps that one.
    await s
      .place({
        consents: [
          { consentId: terms, documentVersionId: newer },
          { consentId: news, documentVersionId: null },
        ],
      })
      .expect(201)
    const kept = await storedRows('order_consents', s.t.id)
    expect(kept.map((row) => [row.consent_id, row.document_version_id])).toEqual(
      expect.arrayContaining([
        [terms, newer],
        [news, null],
      ]),
    )
    expect(kept).toHaveLength(2)
  })

  it('places nothing for a teen until the guardian’s consent on paper is acknowledged', async () => {
    const s = await shop()

    const res = await s.place({ ageBand: 'teen' }).expect(422)
    expect(res.body).toMatchObject({
      code: 'order.consent-missing',
      params: { consent: 'guardian' },
    })
    await nothingPlaced(s)

    await s.place({ ageBand: 'teen', guardianConsentAcknowledged: true }).expect(201)
    const [order] = await s.orders()
    expect(moment(order!.guardian_consent_acknowledged_at)).toBeGreaterThan(Date.now() - MINUTE)
  })

  it('places nothing with a failed bot check, and says so', async () => {
    const s = await shop()

    const res = await s.place({ botCheckToken: 'not-the-token' }).expect(403)

    expect(res.body).toMatchObject({ code: 'bot-check.failed' })
    await nothingPlaced(s)
  })

  it('places nothing under two emails that differ, or one the provider cannot take', async () => {
    const s = await shop()
    await s.place({ emailConfirmation: 'other@example.test' }).expect(400)

    // The fake provider takes fifty characters, as a real one has a limit of its own.
    const long = `${'a'.repeat(39)}@example.test`
    const res = await s.place({ email: long, emailConfirmation: long }).expect(422)
    expect(res.body).toMatchObject({ code: 'order.email-refused' })
    await nothingPlaced(s)
  })

  it('refuses an email the provider cannot take also when there is nothing to pay', async () => {
    const s = await shop({ amountMinor: 0 })
    const long = `${'a'.repeat(39)}@example.test`

    const res = await s.place({ email: long, emailConfirmation: long, expectedTotalMinor: 0 })

    expect(res.status).toBe(422)
    expect(res.body).toMatchObject({ code: 'order.email-refused' })
  })

  it('places nothing in a closed shop, an unpublished edition or a suspended convention', async () => {
    const s = await shop()
    await setPublished(s.edition, false)
    await s.place().expect(404)
    await setPublished(s.edition, true)

    const closed = await tenantWithHead()
    const edition = await addEdition(closed.id)
    await setPublished(edition, true)
    const type = await addTicketType(closed.id, edition)
    const editions = await request(app.getHttpServer()).get(
      `/public/tenants/${closed.slug}/editions`,
    )
    const res = await request(app.getHttpServer())
      .post(
        `/public/tenants/${closed.slug}/editions/${(editions.body as { slug: string }[])[0]!.slug}/shop/orders`,
      )
      .send(s.order({ cart: { ticket: { ticketTypeId: type } } }))
      .expect(409)
    expect(res.body).toMatchObject({ code: 'shop.closed' })

    await suspend(s.t.id)
    await s.place().expect(404)
    await nothingPlaced(s)
  })
})

describe('the total of an order', () => {
  it('that differs from the one the buyer saw places nothing, and tells the new one', async () => {
    const s = await shop()

    const res = await s.place({ expectedTotalMinor: 9000 }).expect(409)

    expect(res.body).toMatchObject({ code: 'order.total-changed', params: { totalMinor: 10000 } })
    expect(await s.orders()).toEqual([])
  })

  // The prices an org may set and the quantities a cart may hold come to more than an order
  // keeps of an amount. Such an order is refused by its total, before anything is written.
  it('above the most an order comes to places nothing and prices nothing, and says so', async () => {
    const s = await shop()
    const statue = await addMerchandiseItem(s.t.id, s.edition, { name: 'Statue', stock: 100 })
    await setColumn('merchandise_items', statue.id, 'amount_minor', MAX_AMOUNT_MINOR)
    await setColumn('merchandise_items', statue.id, 'per_order_limit', 100)
    await offerWith(s.t.id, s.edition, s.standard, { itemIds: [statue.id] })
    const of = (quantity: number) => ({
      cart: {
        ticket: { ticketTypeId: s.standard },
        items: [{ variantId: statue.variantId, quantity }],
      },
      expectedTotalMinor: 10000 + quantity * MAX_AMOUNT_MINOR,
    })
    expect(of(22).expectedTotalMinor).toBeGreaterThan(MAX_ORDER_TOTAL_MINOR)

    const res = await s.place(of(22)).expect(409)

    expect(res.body).toMatchObject({ code: 'order.total-too-high' })
    const quoted = await request(app.getHttpServer())
      .post(`/public/tenants/${s.t.slug}/editions/${s.slug}/shop/quote`)
      .send(of(22).cart)
      .expect(409)
    expect(quoted.body).toMatchObject({ code: 'order.total-too-high' })
    expect(await s.orders()).toEqual([])
    // One fewer comes to less, and is placed.
    await s.place(of(21)).expect(201)
    expect(await s.orders()).toMatchObject([{ total_minor: of(21).expectedTotalMinor }])
  })

  it('rests on a tier for thirty minutes after its end, and no longer', async () => {
    const tiers = (ended: number) => [
      { amountMinor: 8000, startsAt: ago(1000), endsAt: ago(ended) },
      { amountMinor: 10000, startsAt: ago(ended), endsAt: ahead(1000) },
    ]
    const recent = await shop({ tiers: tiers(29) })
    const old = await shop({ tiers: tiers(31) })

    // The buyer saw the price of the tier that ended 29 minutes ago: the order is placed at it.
    await recent.place({ expectedTotalMinor: 8000 }).expect(201)
    expect(await recent.orders()).toMatchObject([{ total_minor: 8000 }])
    expect(await storedRows('order_lines', recent.t.id)).toMatchObject([{ amount_minor: 8000 }])
    // A buyer who saw the price in force pays that.
    await recent.place({ email: 'b@example.test', emailConfirmation: 'b@example.test' }).expect(201)

    const late = await old.place({ expectedTotalMinor: 8000 }).expect(409)
    expect(late.body).toMatchObject({ code: 'order.total-changed', params: { totalMinor: 10000 } })
    expect(await old.orders()).toEqual([])
  })

  it('rests on a sale window for thirty minutes after its end, and then the sale is closed', async () => {
    const window = (ended: number) => ({ saleStartsAt: ago(1000), saleEndsAt: ago(ended) })
    const recent = await shop(window(29))
    const old = await shop(window(31))

    await recent.place().expect(201)

    const late = await old.place().expect(409)
    expect(late.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'ticket-type', id: old.standard },
    })
  })

  // The thirty minutes are of a price, not of a pre-order: merchandise sells as it stands now.
  it('does not carry a pre-order past its deadline', async () => {
    const s = await shop({
      tiers: [
        { amountMinor: 8000, startsAt: ago(1000), endsAt: ago(10) },
        { amountMinor: 10000, startsAt: ago(10), endsAt: ahead(1000) },
      ],
    })
    const pin = await addMerchandiseItem(s.t.id, s.edition, { stock: null })
    await offerWith(s.t.id, s.edition, s.standard, { itemIds: [pin.id] })
    await setCatalogSettings(s.t.id, s.edition, { merchPreorderDeadline: ago(10) })

    const res = await s
      .place({
        cart: {
          ticket: { ticketTypeId: s.standard },
          items: [{ variantId: pin.variantId, quantity: 1 }],
        },
        expectedTotalMinor: 13000,
      })
      .expect(409)

    expect(res.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'variant', id: pin.variantId },
    })
  })
})

describe('the limits of what is sold', () => {
  it('hold against orders placed one after another', async () => {
    const s = await shop({ capacity: 1 })
    const workshop = await addAddOn(s.t.id, s.edition, { kind: 'limited', capacity: 1 })
    const pin = await addMerchandiseItem(s.t.id, s.edition, { stock: 2 })
    const wide = await addTicketType(s.t.id, s.edition, { name: 'Wide' })
    await offerWith(s.t.id, s.edition, wide, { addOnIds: [workshop], itemIds: [pin.id] })
    const second = (changes: Row) => ({
      email: 'b@example.test',
      emailConfirmation: 'b@example.test',
      ...changes,
    })

    await s.place().expect(201)
    const ticket = await s.place(second({})).expect(409)
    expect(ticket.body).toMatchObject({ params: { kind: 'ticket-type', id: s.standard } })

    const withAddOn = { cart: { ticket: { ticketTypeId: wide }, addOnIds: [workshop] } }
    await s.place(withAddOn).expect(201)
    const addOn = await s.place(second(withAddOn)).expect(409)
    expect(addOn.body).toMatchObject({ params: { kind: 'add-on', id: workshop } })

    const withPins = (quantity: number) => ({
      cart: { ticket: { ticketTypeId: wide }, items: [{ variantId: pin.variantId, quantity }] },
      expectedTotalMinor: 10000 + quantity * 5000,
      email: 'c@example.test',
      emailConfirmation: 'c@example.test',
    })
    await s.place(withPins(2)).expect(201)
    const variant = await s.place(second(withPins(1))).expect(409)
    expect(variant.body).toMatchObject({ params: { kind: 'variant', id: pin.variantId } })
  })

  it.each([
    ['ticket', {}],
    ['place of an add-on', { addOn: true }],
    ['variant', { variant: true }],
  ])('sell the last %s once to orders placed at the same moment', async (_, taken) => {
    const s = await shop('addOn' in taken || 'variant' in taken ? {} : { capacity: 1 })
    const workshop = await addAddOn(s.t.id, s.edition, { kind: 'limited', capacity: 1 })
    const pin = await addMerchandiseItem(s.t.id, s.edition, { stock: 1 })
    await offerWith(s.t.id, s.edition, s.standard, { addOnIds: [workshop], itemIds: [pin.id] })
    const body = (email: string) => ({
      email,
      emailConfirmation: email,
      cart: {
        ticket: { ticketTypeId: s.standard },
        ...('addOn' in taken && { addOnIds: [workshop] }),
        ...('variant' in taken && { items: [{ variantId: pin.variantId, quantity: 1 }] }),
      },
      expectedTotalMinor: 'variant' in taken ? 15000 : 10000,
    })
    const buyers = Array.from({ length: 6 }, (_, n) => `buyer-${n}@example.test`)

    const answers = await Promise.all(buyers.map((email) => s.place(body(email))))

    expect(answers.map((res) => res.status).sort()).toEqual([201, 409, 409, 409, 409, 409])
    expect(await s.orders()).toHaveLength(1)
  })

  // The last variant a merch-only shop sold: the next buyer returns to the Merch step for it.
  it('name the variant that ran out also when merchandise alone has nothing else left', async () => {
    const s = await shop()
    const pin = await addMerchandiseItem(s.t.id, s.edition, { stock: 1 })
    await setCatalogSettings(s.t.id, s.edition, { merchOnlyEnabled: true })
    const alone = (email: string) => ({
      cart: { ticket: null, items: [{ variantId: pin.variantId, quantity: 1 }] },
      ageBand: null,
      expectedTotalMinor: 5000,
      email,
      emailConfirmation: email,
    })

    await s.place(alone('a@example.test')).expect(201)
    const res = await s.place(alone('b@example.test')).expect(409)

    expect(res.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'variant', id: pin.variantId },
    })
  })

  it('count what an order holds, and no longer what an expired one held', async () => {
    const s = await shop({ capacity: 1 })
    const held = await addOrder(s.t.id, s.edition, { ticketTypeId: s.standard })

    await s.place().expect(409)
    await setColumn('orders', held.id, 'holds', false)
    await s.place().expect(201)
  })

  it('let one email hold three orders awaiting payment in an edition, and no fourth', async () => {
    const s = await shop()
    for (let n = 0; n < MAX_UNPAID_ORDERS; n += 1) await s.place().expect(201)

    const res = await s.place().expect(409)
    expect(res.body).toMatchObject({ code: 'order.too-many-unpaid' })
    // Another email places its own, and so does the first once one of its orders is paid.
    await s.place({ email: 'b@example.test', emailConfirmation: 'b@example.test' }).expect(201)
    const [first] = await s.orders()
    await setColumn('orders', String(first!.id), 'status', 'paid')
    await s.place().expect(201)
  })

  // Carts that share no ticket type wait for nothing of each other's stock or capacity.
  it('let one email hold no fourth order awaiting payment placed at the same moment', async () => {
    const s = await shop()
    const types = [s.standard]
    for (const name of ['Second', 'Third', 'Fourth', 'Fifth', 'Sixth']) {
      types.push(await addTicketType(s.t.id, s.edition, { name }))
    }

    const answers = await Promise.all(
      types.map((ticketTypeId) => s.place({ cart: { ticket: { ticketTypeId } } })),
    )

    expect(answers.map((res) => res.status).sort()).toEqual([201, 201, 201, 409, 409, 409])
    expect(await s.orders()).toHaveLength(MAX_UNPAID_ORDERS)
  })
})

describe('an order placed by an account', () => {
  const asAccount = (s: Shop, who: Member, body: Row, edition = s.edition, slug = s.t.slug) =>
    request(app.getHttpServer())
      .post(`/editions/${edition}/shop/orders`)
      .use(session(who.token))
      .set('X-Tenant-Slug', slug)
      .send(body)
  /** The order as an account sends it: with no email, which is the account's own. */
  const body = (s: Shop, changes: Row = {}) =>
    Object.fromEntries(Object.entries(s.order(changes)).filter(([key]) => !key.startsWith('email')))

  it('is under the account’s own email and attached to the account, with no place in the team', async () => {
    const s = await shop()
    const buyer = await member()

    const res = await asAccount(s, buyer, body(s)).expect(201)

    expect(placed(res)).toMatchObject({ status: 'awaiting-payment' })
    expect(await s.orders()).toMatchObject([{ email: buyer.email.toLowerCase() }])
    expect(await storedRows('order_accounts', s.t.id)).toMatchObject([
      { order_id: placed(res).orderId, account_id: buyer.id },
    ])
  })

  it('takes no email of its own choosing, and needs a session', async () => {
    const s = await shop()
    const buyer = await member()

    await asAccount(s, buyer, s.order()).expect(400)
    await request(app.getHttpServer())
      .post(`/editions/${s.edition}/shop/orders`)
      .set('X-Tenant-Slug', s.t.slug)
      .send(body(s))
      .expect(401)
    expect(await s.orders()).toEqual([])
  })

  it('is refused as a visitor’s is: the bot check, the total and what ran out', async () => {
    const s = await shop({ capacity: 1 })
    const buyer = await member()

    const robot = await asAccount(s, buyer, body(s, { botCheckToken: 'no' })).expect(403)
    expect(robot.body).toMatchObject({ code: 'bot-check.failed' })
    const total = await asAccount(s, buyer, body(s, { expectedTotalMinor: 1 })).expect(409)
    expect(total.body).toMatchObject({ code: 'order.total-changed' })
    await addOrder(s.t.id, s.edition, { ticketTypeId: s.standard })
    const gone = await asAccount(s, buyer, body(s)).expect(409)
    expect(gone.body).toMatchObject({ code: 'order.unavailable' })
    expect(await storedRows('order_accounts', s.t.id)).toEqual([])
  })

  it('finds no edition of another convention, and none that is not published', async () => {
    const [s, other] = [await shop(), await shop()]
    const buyer = await member()

    await asAccount(s, buyer, body(s), other.edition).expect(404)
    await setPublished(s.edition, false)
    await asAccount(s, buyer, body(s)).expect(404)
    expect(await other.orders()).toEqual([])
  })

  // Checkout answers alike for any email: it never tells whether an email has an account.
  it('is not told from a visitor’s under the same email', async () => {
    const s = await shop()
    const known = await member()

    const res = await s.place({ email: known.email, emailConfirmation: known.email }).expect(201)

    expect(Object.keys(placed(res)).sort()).toEqual([
      'number',
      'orderId',
      'resultToken',
      'status',
      'totalMinor',
    ])
    // Not attached yet: an unpaid order under an email proves nothing of who placed it.
    expect(await storedRows('order_accounts', s.t.id)).toEqual([])
  })

  // Whoever knows an address places a visitor's orders under it. They fill the three of a
  // visitor under that address, and never those of the account whose address it is.
  it('holds three orders awaiting payment of its own, whatever visitors placed under its email', async () => {
    const s = await shop()
    const [known, other] = [await member(), await member()]
    const theirs = { email: known.email, emailConfirmation: known.email }
    for (let n = 0; n < MAX_UNPAID_ORDERS; n += 1) await s.place(theirs).expect(201)
    const visitor = await s.place(theirs).expect(409)
    expect(visitor.body).toMatchObject({ code: 'order.too-many-unpaid' })

    for (let n = 0; n < MAX_UNPAID_ORDERS; n += 1) await asAccount(s, known, body(s)).expect(201)

    const fourth = await asAccount(s, known, body(s)).expect(409)
    expect(fourth.body).toMatchObject({ code: 'order.too-many-unpaid', params: { limit: 3 } })
    // Another account places its own, and so does the first once one of its orders is paid.
    await asAccount(s, other, body(s)).expect(201)
    const attached = await storedRows('order_accounts', s.t.id)
    const own = attached.find((row) => row.account_id === known.id)!
    await setColumn('orders', String(own.order_id), 'status', 'paid')
    await asAccount(s, known, body(s)).expect(201)
  })

  it('leaves a visitor under its email the three orders of the address', async () => {
    const s = await shop()
    const known = await member()
    for (let n = 0; n < MAX_UNPAID_ORDERS; n += 1) await asAccount(s, known, body(s)).expect(201)
    const theirs = { email: known.email, emailConfirmation: known.email }

    for (let n = 0; n < MAX_UNPAID_ORDERS; n += 1) await s.place(theirs).expect(201)

    // Answered as for any address: nothing tells that this one has an account.
    const fourth = await s.place(theirs).expect(409)
    expect(fourth.body).toMatchObject({ code: 'order.too-many-unpaid', params: { limit: 3 } })
    expect(await storedRows('order_accounts', s.t.id)).toHaveLength(MAX_UNPAID_ORDERS)
  })

  // Carts that share no ticket type wait for nothing of each other's stock or capacity.
  it('holds no fourth order awaiting payment placed at the same moment', async () => {
    const s = await shop()
    const buyer = await member()
    const types = [s.standard]
    for (const name of ['Second', 'Third', 'Fourth', 'Fifth', 'Sixth']) {
      types.push(await addTicketType(s.t.id, s.edition, { name }))
    }

    const answers = await Promise.all(
      types.map((ticketTypeId) =>
        asAccount(s, buyer, body(s, { cart: { ticket: { ticketTypeId } } })),
      ),
    )

    expect(answers.map((res) => res.status).sort()).toEqual([201, 201, 201, 409, 409, 409])
    expect(await s.orders()).toHaveLength(MAX_UNPAID_ORDERS)
  })
})
