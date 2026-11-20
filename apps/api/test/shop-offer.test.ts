import { type NestExpressApplication } from '@nestjs/platform-express'
import { type Offer } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import {
  addAddOn,
  addConsent,
  addCustomField,
  addDocument,
  addEdition,
  addMerchandiseItem,
  addOrder,
  addTicketType,
  closeTenantDb,
  deleteCreatedTenants,
  makeShopReady,
  offerWith,
  openShop,
  setCatalogSettings,
  setColumn,
  setPublished,
  suspend,
  tenantWithHead,
} from './tenants'

// The shop of an edition as anyone sees it (docs/specs/0004-checkout-and-orders.md, S1-S6): the
// offer of a published edition whose shop is open, or the org's message while nothing is on sale,
// and the price of a cart. No sign-in: the address names the convention and the edition.

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

const PAST = '2020-01-01T00:00:00Z'
const FUTURE = '2099-01-01T00:00:00Z'

/** The slug of the one published edition of a convention. */
async function editionSlugOf(tenantSlug: string) {
  const res = await request(app.getHttpServer()).get(`/public/tenants/${tenantSlug}/editions`)
  return (res.body as { slug: string }[])[0]!.slug
}

/** A published edition whose shop is open, with nothing to sell yet. */
async function shop() {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id)
  await setPublished(edition, true)
  const ready = await makeShopReady(t.id, edition)
  await openShop(t.id, edition)
  const slug = await editionSlugOf(t.slug)
  const path = `/public/tenants/${t.slug}/editions/${slug}/shop`
  const offer = async () => (await request(app.getHttpServer()).get(path).expect(200)).body as Offer
  const quote = (cart: object) => request(app.getHttpServer()).post(`${path}/quote`).send(cart)
  return { t, edition, slug, path, ready, offer, quote }
}

describe('the offer of a shop', () => {
  it('is no address under an unknown convention, an unpublished edition or a suspended one', async () => {
    const s = await shop()
    await request(app.getHttpServer())
      .get(`/public/tenants/no-such-convention/editions/${s.slug}/shop`)
      .expect(404)
    await request(app.getHttpServer())
      .get(`/public/tenants/${s.t.slug}/editions/no-such-edition/shop`)
      .expect(404)

    await setPublished(s.edition, false)
    await request(app.getHttpServer()).get(s.path).expect(404)
    await setPublished(s.edition, true)
    await request(app.getHttpServer()).get(s.path).expect(200)

    await suspend(s.t.id)
    await request(app.getHttpServer()).get(s.path).expect(404)
  })

  // The seller's details and the provider are for buyers: nobody reads them before a shop opens.
  it('shows the message of a closed shop instead of products, and names no seller and no provider', async () => {
    const t = await tenantWithHead()
    const edition = await addEdition(t.id)
    await setPublished(edition, true)
    await makeShopReady(t.id, edition)
    await addTicketType(t.id, edition)
    await setCatalogSettings(t.id, edition, {
      salesClosedMessage: 'Tickets return in spring.',
      faqUrl: 'https://convention.test/faq',
    })
    const slug = await editionSlugOf(t.slug)

    const res = await request(app.getHttpServer())
      .get(`/public/tenants/${t.slug}/editions/${slug}/shop`)
      .expect(200)

    expect(res.body).toMatchObject({
      open: false,
      onSale: false,
      salesClosedMessage: 'Tickets return in spring.',
      faqUrl: 'https://convention.test/faq',
      seller: null,
      provider: null,
      ticketTypes: [],
      addOns: [],
      items: [],
    })
    expect((res.body as Offer).documents.map((document) => document.kind)).toEqual([
      'shop-terms',
      'privacy-policy',
    ])
  })

  it('shows the message too while its shop is open and nothing is on sale', async () => {
    const s = await shop()
    await setCatalogSettings(s.t.id, s.edition, { salesClosedMessage: 'Soon.' })
    await addTicketType(s.t.id, s.edition, { saleStartsAt: '2098-01-01T00:00:00Z' })

    expect(await s.offer()).toMatchObject({
      open: true,
      onSale: false,
      salesClosedMessage: 'Soon.',
    })
  })

  it('shows each ticket type on sale with its price in force and what it offers', async () => {
    const s = await shop()
    const room = await addAddOn(s.t.id, s.edition, { name: 'Room', kind: 'headcount' })
    const pin = await addMerchandiseItem(s.t.id, s.edition, { name: 'Pin', stock: 5 })
    const standard = await addTicketType(s.t.id, s.edition, {
      name: 'Standard',
      ageBands: ['teen', 'adult'],
      discountsExcluded: true,
      tiers: [
        { amountMinor: 12000, startsAt: PAST, endsAt: '2098-01-01T00:00:00Z' },
        { amountMinor: 15000, startsAt: '2098-01-01T00:00:00Z', endsAt: FUTURE },
      ],
      // Only those above the price in force are offered.
      supporterPrices: [10000, 12000, 20000],
      perks: ['A pin', 'A badge'],
    })
    await offerWith(s.t.id, s.edition, standard, { addOnIds: [room], itemIds: [pin.id] })

    const offer = await s.offer()

    expect(offer).toMatchObject({ open: true, onSale: true, currency: 'PLN' })
    expect(offer.ticketTypes).toEqual([
      {
        id: standard,
        name: 'Standard',
        shortDescription: '',
        longDescription: '',
        state: 'on-sale',
        priceMinor: 12000,
        supporterPrices: [20000],
        perks: ['A pin', 'A badge'],
        ageBands: ['teen', 'adult'],
        discountsExcluded: true,
        addOnIds: [room],
        merchandiseItemIds: [pin.id],
      },
    ])
  })

  it('hides a ticket type outside its sale window, or shows it as not selectable, as its org set', async () => {
    const s = await shop()
    const outside = { saleStartsAt: '2098-01-01T00:00:00Z' }
    await addTicketType(s.t.id, s.edition, { name: 'Hidden later', ...outside })
    await addTicketType(s.t.id, s.edition, {
      name: 'Later',
      shownOutsideSaleWindow: true,
      ...outside,
    })
    await addTicketType(s.t.id, s.edition, {
      name: 'Over',
      shownOutsideSaleWindow: true,
      saleStartsAt: PAST,
      saleEndsAt: '2021-01-01T00:00:00Z',
    })
    // Inside its window, with no tier that covers today: it has no price, so it is not on sale.
    await addTicketType(s.t.id, s.edition, {
      name: 'No price',
      shownOutsideSaleWindow: true,
      amountMinor: null,
    })
    await addTicketType(s.t.id, s.edition, { name: 'Hidden', hidden: true })

    const offer = await s.offer()

    expect(offer.ticketTypes.map((type) => [type.name, type.state, type.priceMinor])).toEqual([
      ['Later', 'not-yet', null],
      ['Over', 'closed', null],
      ['No price', 'closed', null],
    ])
    expect(offer.onSale).toBe(false)
  })

  it('shows a ticket type with no capacity left as sold out, counting the orders that hold', async () => {
    const s = await shop()
    const standard = await addTicketType(s.t.id, s.edition, { capacity: 2 })
    const state = async () => (await s.offer()).ticketTypes[0]!.state

    await addOrder(s.t.id, s.edition, { ticketTypeId: standard })
    // An expired order holds nothing.
    await addOrder(s.t.id, s.edition, { ticketTypeId: standard, status: 'expired', holds: false })
    expect(await state()).toBe('on-sale')

    await addOrder(s.t.id, s.edition, { ticketTypeId: standard, status: 'paid' })
    expect(await state()).toBe('sold-out')
    expect((await s.offer()).onSale).toBe(false)
  })

  it('says of an add-on whether a place is left, and how many only below its threshold', async () => {
    const s = await shop()
    const workshop = await addAddOn(s.t.id, s.edition, {
      name: 'Workshop',
      kind: 'limited',
      capacity: 3,
      placesLeftThreshold: 2,
      amountMinor: 4000,
    })
    await addAddOn(s.t.id, s.edition, { name: 'Room', kind: 'headcount' })
    await addAddOn(s.t.id, s.edition, { name: 'Hidden', hidden: true })
    const standard = await addTicketType(s.t.id, s.edition)
    const places = async () => {
      const [first, second] = (await s.offer()).addOns
      return [first!.soldOut, first!.placesLeft, second!.soldOut, second!.placesLeft]
    }

    expect((await s.offer()).addOns.map((addOn) => addOn.name)).toEqual(['Workshop', 'Room'])
    // Three left of three: not below the threshold, so the shop does not say how many.
    expect(await places()).toEqual([false, null, false, null])
    await addOrder(s.t.id, s.edition, { ticketTypeId: standard, addOnIds: [workshop] })
    await addOrder(s.t.id, s.edition, { ticketTypeId: standard, addOnIds: [workshop] })
    expect(await places()).toEqual([false, 1, false, null])
    await addOrder(s.t.id, s.edition, { ticketTypeId: standard, addOnIds: [workshop] })
    expect(await places()).toEqual([true, 0, false, null])
  })

  it('says of a variant the most one order may take of it, and never the stock', async () => {
    const s = await shop()
    const pin = await addMerchandiseItem(s.t.id, s.edition, { name: 'Pin', stock: 4 })
    const shirt = await addMerchandiseItem(s.t.id, s.edition, {
      name: 'T-shirt',
      sized: true,
      stock: 30,
      pictures: 1,
    })
    await addMerchandiseItem(s.t.id, s.edition, { name: 'Hidden', hidden: true })
    const most = async (name: string) =>
      (await s.offer()).items
        .find((item) => item.name === name)!
        .variants.map((variant) => variant.maxQuantity)

    const offer = await s.offer()
    expect(offer.items.map((item) => item.name)).toEqual(['Pin', 'T-shirt'])
    // The item's limit an order is five: the stock of the pin is less, the T-shirt's more.
    expect(await most('Pin')).toEqual([4])
    expect(await most('T-shirt')).toEqual([5])
    expect(offer.items[1]).toMatchObject({
      axes: [{ name: 'Size', values: [{ label: 'M', sizeChart: { fileId: shirt.chartFileId } }] }],
      pictures: [{ fileId: shirt.pictureFileIds[0], width: 40, height: 30 }],
    })
    expect(JSON.stringify(offer)).not.toMatch(/"stock"|"capacity"/)

    await addOrder(s.t.id, s.edition, {
      variants: [{ itemId: pin.id, variantId: pin.variantId, quantity: 3 }],
    })
    expect(await most('Pin')).toEqual([1])
    await addOrder(s.t.id, s.edition, {
      status: 'paid',
      variants: [{ itemId: pin.id, variantId: pin.variantId, quantity: 1 }],
    })
    expect(await most('Pin')).toEqual([0])

    // A hidden variant is not on offer at all.
    await setColumn('merchandise_variants', shirt.variantId, 'hidden_at', new Date().toISOString())
    expect(await most('T-shirt')).toEqual([])
  })

  it('sells an unlimited variant until the pre-order deadline alone', async () => {
    const s = await shop()
    await addMerchandiseItem(s.t.id, s.edition, { name: 'Pin', stock: null })
    const most = async () => (await s.offer()).items[0]!.variants[0]!.maxQuantity

    // No deadline is no pre-order: an unlimited variant sells nothing.
    expect(await most()).toBe(0)
    await setCatalogSettings(s.t.id, s.edition, { merchPreorderDeadline: FUTURE })
    expect(await most()).toBe(5)
    expect((await s.offer()).merchPreorderDeadline).toBe('2099-01-01T00:00:00.000Z')
    await setCatalogSettings(s.t.id, s.edition, { merchPreorderDeadline: PAST })
    expect(await most()).toBe(0)
  })

  it('offers merchandise alone only while the edition turned it on and an item can be had', async () => {
    const s = await shop()
    await addMerchandiseItem(s.t.id, s.edition, { stock: 5 })

    expect(await s.offer()).toMatchObject({ merchOnly: false, onSale: false })
    await setCatalogSettings(s.t.id, s.edition, { merchOnlyEnabled: true })
    expect(await s.offer()).toMatchObject({ merchOnly: true, onSale: true })
  })

  it('carries what the checkout asks and links: the bands, the fields, the consents and the documents', async () => {
    const s = await shop()
    await addTicketType(s.t.id, s.edition)
    await setCatalogSettings(s.t.id, s.edition, {
      teenFromAge: 13,
      adultFromAge: 18,
      guardianConsentFormUrl: 'https://convention.test/consent.pdf',
    })
    const city = await addCustomField(s.t.id, s.edition, { label: 'City', isRequired: true })
    await addCustomField(s.t.id, s.edition, { label: 'Hidden', hidden: true })
    const terms = await addConsent(s.t.id, s.edition, {
      documentId: s.ready.terms.id,
      text: 'I accept the terms.',
    })
    const news = await addConsent(s.t.id, s.edition, { text: 'Send me news.', isRequired: false })
    const draft = await addDocument(s.t.id, s.edition, 'edition-rules', { versions: 0 })
    const rules = await addDocument(s.t.id, s.edition, 'other', { versions: 2, title: 'Rules' })

    const offer = await s.offer()

    expect(offer).toMatchObject({
      ageBands: { teenFromAge: 13, adultFromAge: 18 },
      guardianConsentFormUrl: 'https://convention.test/consent.pdf',
      customFields: [{ id: city, label: 'City', isRequired: true }],
      consents: [
        {
          id: terms,
          text: 'I accept the terms.',
          isRequired: true,
          documentVersionId: s.ready.terms.versionIds[0],
        },
        { id: news, text: 'Send me news.', isRequired: false, documentVersionId: null },
      ],
      seller: {
        name: 'Seller Ltd',
        address: '1 Main St',
        registrationNumber: '0000000000',
        contactEmail: 'shop@seller.test',
      },
    })
    // The newest version of each document that has one; a document with none is not linked.
    expect(offer.documents).toEqual([
      { kind: 'shop-terms', title: 'shop-terms', versionId: s.ready.terms.versionIds[0] },
      { kind: 'privacy-policy', title: 'privacy-policy', versionId: s.ready.privacy.versionIds[0] },
      { kind: 'other', title: 'Rules', versionId: rules.versionIds[1] },
    ])
    expect(JSON.stringify(offer)).not.toContain(draft.id)
  })

  it("names the provider's methods and what its module requires of the page, and no credential", async () => {
    const s = await shop()
    await addTicketType(s.t.id, s.edition)

    const offer = await s.offer()

    expect(offer.provider).toEqual({
      name: 'fake',
      methods: ['blik', 'transfer', 'card'],
      consent: {
        text: {
          en: expect.stringContaining('fake payment provider') as string,
          pl: expect.any(String) as string,
        },
        links: [
          { label: expect.any(Object) as object, url: expect.stringMatching(/^https:/) as string },
        ],
        selectAllAllowed: false,
      },
      maxEmailLength: 50,
    })
    expect(JSON.stringify(offer)).not.toContain('sealed')
  })
})

describe('the price of a cart', () => {
  it('is the lines and the total, as the offer prices them', async () => {
    const s = await shop()
    const room = await addAddOn(s.t.id, s.edition, { name: 'Room', amountMinor: 2500 })
    const pin = await addMerchandiseItem(s.t.id, s.edition, { name: 'Pin', stock: 5 })
    const standard = await addTicketType(s.t.id, s.edition, { name: 'Standard' })
    await offerWith(s.t.id, s.edition, standard, { addOnIds: [room], itemIds: [pin.id] })

    const res = await s
      .quote({
        ticket: { ticketTypeId: standard },
        addOnIds: [room],
        items: [{ variantId: pin.variantId, quantity: 2 }],
      })
      .expect(200)

    expect(res.body).toMatchObject({
      currency: 'PLN',
      totalMinor: 10000 + 2500 + 2 * 5000,
      lines: [
        { kind: 'ticket', name: 'Standard', amountMinor: 10000 },
        { kind: 'add_on', name: 'Room', amountMinor: 2500 },
        { kind: 'merchandise', name: 'Pin', quantity: 2, amountMinor: 10000 },
      ],
    })
  })

  it('names what cannot be had', async () => {
    const s = await shop()
    const standard = await addTicketType(s.t.id, s.edition, { capacity: 1 })
    await addOrder(s.t.id, s.edition, { ticketTypeId: standard })

    const res = await s.quote({ ticket: { ticketTypeId: standard } }).expect(409)

    expect(res.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'ticket-type', id: standard },
    })
  })

  it('is none while the shop is closed, and a cart that is no cart is a bad request', async () => {
    const s = await shop()
    const standard = await addTicketType(s.t.id, s.edition)
    await s.quote({ ticket: { ticketTypeId: 'standard' } }).expect(400)
    await s.quote({ ticket: { ticketTypeId: standard }, total: 1 }).expect(400)

    const closed = await tenantWithHead()
    const edition = await addEdition(closed.id)
    await setPublished(edition, true)
    const type = await addTicketType(closed.id, edition)
    const slug = await editionSlugOf(closed.slug)

    const res = await request(app.getHttpServer())
      .post(`/public/tenants/${closed.slug}/editions/${slug}/shop/quote`)
      .send({ ticket: { ticketTypeId: type } })
      .expect(409)
    expect(res.body).toMatchObject({ code: 'shop.closed' })
  })
})
