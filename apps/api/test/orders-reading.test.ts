import { createHash } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { type OrderDetail, type OrderList } from '@opos/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import { orderDesk } from './order-desk'
import {
  addAddOn,
  addConsent,
  addCustomField,
  addDocument,
  addEdition,
  addEditionAccess,
  addMerchandiseItem,
  addOrder,
  addOrg,
  addQrCode,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  offerWith,
  setColumn,
} from './tenants'

// What an org reads of an edition's orders (docs/specs/0006-order-management.md, F1-F3): the
// list, searched and filtered, with the orders needing review first, and the page of one order
// with everything the order keeps.

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

const list = (res: { body: unknown }) => res.body as OrderList
const numbers = (res: { body: unknown }) => list(res).orders.map((order) => order.number)
const hashOf = (code: string) => createHash('sha256').update(code).digest('hex')
const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60_000).toISOString()

describe('the list of an edition’s orders', () => {
  it('holds the orders needing review first, and then the newest', async () => {
    const d = await orderDesk(app)
    const old = await addOrder(d.t.id, d.edition, { status: 'paid', placedAt: days(3) })
    const review = await addOrder(d.t.id, d.edition, {
      status: 'needs-review',
      reviewCause: 'amount',
      placedAt: days(2),
    })
    const fresh = await addOrder(d.t.id, d.edition, {
      status: 'awaiting-payment',
      placedAt: days(1),
      ticketTypeId: d.standard,
      holderName: 'Grace Hopper',
      email: 'grace@example.test',
    })
    const manual = await addOrder(d.t.id, d.edition, {
      status: 'paid-manual',
      email: null,
      manualReason: 'desk',
      placedAt: days(4),
      totalMinor: 0,
    })

    const res = await d.head('get', '/orders').expect(200)

    expect(numbers(res)).toEqual([review.number, fresh.number, old.number, manual.number])
    expect(list(res).total).toBe(4)
    expect(list(res).needsReview).toBe(1)
    expect(list(res).orders[1]).toEqual({
      id: fresh.id,
      number: fresh.number,
      status: 'awaiting-payment',
      email: 'grace@example.test',
      holderName: 'Grace Hopper',
      totalMinor: 10000,
      placedAt: expect.any(String) as string,
      manualReason: null,
      ticketType: 'Standard',
    })
    expect(list(res).orders[3]).toMatchObject({
      email: null,
      manualReason: 'desk',
      ticketType: null,
      totalMinor: 0,
    })
  })

  it('finds an order by a part of its number, of its ticket holder’s name or of its email', async () => {
    const d = await orderDesk(app)
    const ada = await addOrder(d.t.id, d.edition, {
      holderName: 'Ada Lovelace',
      email: 'countess@example.test',
    })
    const grace = await addOrder(d.t.id, d.edition, {
      holderName: 'Grace Hopper',
      email: 'admiral@navy.example.test',
    })
    const find = async (q: string) =>
      numbers(await d.head('get', `/orders?q=${encodeURIComponent(q)}`).expect(200))

    expect(await find(ada.number)).toEqual([ada.number])
    expect(await find(grace.number.slice(2, 8).toLowerCase())).toEqual([grace.number])
    expect(await find('lovel')).toEqual([ada.number])
    expect(await find('  HOPPER ')).toEqual([grace.number])
    expect(await find('admiral@NAVY')).toEqual([grace.number])
    expect(await find('nobody')).toEqual([])
    // What a pattern reads as "anything" is a character like any other in a search.
    expect(await find('%')).toEqual([])
    expect(await find('_da')).toEqual([])
  })

  it('counts what a search found, and the orders needing review whatever it searched', async () => {
    const d = await orderDesk(app)
    await addOrder(d.t.id, d.edition, { status: 'needs-review', holderName: 'Ada' })
    await addOrder(d.t.id, d.edition, { status: 'paid', holderName: 'Grace' })
    await addOrder(d.t.id, d.edition, { status: 'paid', holderName: 'Grace' })

    const res = await d.head('get', '/orders?q=grace').expect(200)

    expect(list(res).total).toBe(2)
    expect(list(res).needsReview).toBe(1)
  })

  // The code itself never travels in an address, where a log would keep it: the panel sends
  // its hash.
  it('finds an order by the hash of the QR code it carries, and by no code it carried before', async () => {
    const d = await orderDesk(app)
    const mine = await addOrder(d.t.id, d.edition, { status: 'paid' })
    await addOrder(d.t.id, d.edition, { status: 'paid' })
    await addQrCode(d.t.id, d.edition, mine.id, 'A'.repeat(32))
    await addQrCode(d.t.id, d.edition, mine.id, 'B'.repeat(32), true)
    const find = async (code: string) =>
      numbers(await d.head('get', `/orders?qrCodeHash=${hashOf(code)}`).expect(200))

    expect(await find('A'.repeat(32))).toEqual([mine.number])
    expect(await find('B'.repeat(32))).toEqual([])
    expect(await find('C'.repeat(32))).toEqual([])
    await d.head('get', `/orders?qrCodeHash=${'A'.repeat(32)}`).expect(400)
    // The code typed into the search of names and numbers finds nothing.
    expect(numbers(await d.head('get', `/orders?q=${'A'.repeat(32)}`).expect(200))).toEqual([])
  })

  it('filters by status, by what an order holds and by when it was placed', async () => {
    const d = await orderDesk(app)
    const room = await addAddOn(d.t.id, d.edition, { name: 'Room' })
    const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 9 })
    const mug = await addMerchandiseItem(d.t.id, d.edition, { name: 'Mug', stock: 9 })
    const ticket = await addOrder(d.t.id, d.edition, {
      status: 'paid',
      ticketTypeId: d.standard,
      placedAt: days(5),
    })
    const withRoom = await addOrder(d.t.id, d.edition, {
      status: 'paid',
      ticketTypeId: d.standard,
      addOnIds: [room],
      placedAt: days(3),
    })
    const merch = await addOrder(d.t.id, d.edition, {
      status: 'canceled',
      holds: false,
      variants: [
        { itemId: pin.id, variantId: pin.variantId, quantity: 2 },
        { itemId: mug.id, variantId: mug.variantId, quantity: 1 },
      ],
      placedAt: days(1),
    })
    const find = async (query: string) =>
      numbers(await d.head('get', `/orders?${query}`).expect(200))

    expect(await find('status=canceled')).toEqual([merch.number])
    expect(await find('status=paid')).toEqual([withRoom.number, ticket.number])
    expect(await find(`ticketTypeId=${d.standard}`)).toEqual([withRoom.number, ticket.number])
    expect(await find(`addOnId=${room}`)).toEqual([withRoom.number])
    expect(await find(`itemId=${mug.id}`)).toEqual([merch.number])
    expect(await find(`variantId=${pin.variantId}`)).toEqual([merch.number])
    expect(await find(`variantId=${pin.variantId}&status=paid`)).toEqual([])
    expect(await find(`from=${encodeURIComponent(days(4))}`)).toEqual([
      merch.number,
      withRoom.number,
    ])
    expect(await find(`to=${encodeURIComponent(days(4))}`)).toEqual([ticket.number])
    expect(
      await find(`from=${encodeURIComponent(days(4))}&to=${encodeURIComponent(days(2))}`),
    ).toEqual([withRoom.number])
  })

  it('reads a page of at most a hundred orders', async () => {
    const d = await orderDesk(app)
    const made = []
    for (let n = 5; n >= 1; n -= 1) {
      made.push(await addOrder(d.t.id, d.edition, { status: 'paid', placedAt: days(n) }))
    }
    const newestFirst = made.map((order) => order.number).reverse()

    const page = await d.head('get', '/orders?limit=2&offset=2').expect(200)

    expect(numbers(page)).toEqual(newestFirst.slice(2, 4))
    expect(list(page).total).toBe(5)
    expect(numbers(await d.head('get', '/orders?offset=4').expect(200))).toEqual(
      newestFirst.slice(4),
    )
    for (const query of ['limit=101', 'limit=0', 'offset=-1', 'status=refunded', 'sort=total']) {
      await d.head('get', `/orders?${query}`).expect(400)
    }
  })

  it('holds no order of another edition or of another convention', async () => {
    const d = await orderDesk(app)
    const other = await orderDesk(app)
    const sibling = await addEdition(d.t.id)
    const mine = await addOrder(d.t.id, d.edition, { holderName: 'Shared Name' })
    const elsewhere = await addOrder(d.t.id, sibling, { holderName: 'Shared Name' })
    const foreign = await addOrder(other.t.id, other.edition, { holderName: 'Shared Name' })
    await addQrCode(other.t.id, other.edition, foreign.id, 'F'.repeat(32))
    await addQrCode(d.t.id, sibling, elsewhere.id, 'S'.repeat(32))

    expect(numbers(await d.head('get', '/orders?q=shared').expect(200))).toEqual([mine.number])
    for (const code of ['F', 'S']) {
      const res = await d.head('get', `/orders?qrCodeHash=${hashOf(code.repeat(32))}`).expect(200)
      expect(list(res).orders).toEqual([])
    }
    // The edition of the path is the one whose orders are read, whoever asks.
    await d.as(other.t.head, 'get', '/orders').expect(403)
  })
})

describe('the page of an order', () => {
  it('shows a shop order with everything it keeps', async () => {
    const d = await orderDesk(app)
    const room = await addAddOn(d.t.id, d.edition, { name: 'Room', amountMinor: 2500 })
    const shirt = await addMerchandiseItem(d.t.id, d.edition, {
      name: 'T-shirt',
      sized: true,
      stock: 5,
    })
    await offerWith(d.t.id, d.edition, d.standard, { addOnIds: [room], itemIds: [shirt.id] })
    const city = await addCustomField(d.t.id, d.edition, { label: 'City' })
    const rules = await addDocument(d.t.id, d.edition, 'edition-rules', {
      versions: 2,
      title: 'Rules',
    })
    const accepted = await addConsent(d.t.id, d.edition, {
      documentId: rules.id,
      text: 'I accept the rules',
    })
    const newsletter = await addConsent(d.t.id, d.edition, {
      text: 'Send me news',
      isRequired: false,
    })

    const placed = await d.paid({
      cart: {
        ticket: { ticketTypeId: d.standard },
        addOnIds: [room],
        items: [{ variantId: shirt.variantId, quantity: 2 }],
      },
      customFieldAnswers: [{ fieldId: city, answer: 'Gdynia' }],
      consentIds: [accepted, newsletter],
      expectedTotalMinor: 10000 + 2500 + 2 * 5000,
    })

    const res = await d.head('get', `/orders/${placed.orderId}`).expect(200)
    const order = res.body as OrderDetail

    expect(order).toMatchObject({
      id: placed.orderId,
      number: placed.number,
      status: 'paid',
      email: 'buyer@example.test',
      holderName: 'Ada Lovelace',
      ageBand: 'adult',
      guardianConsentAcknowledgedAt: null,
      totalMinor: 22500,
      paidMinor: 22500,
      currency: 'PLN',
      holds: true,
      manualReason: null,
      note: null,
      reviewCause: null,
      canceledAt: null,
      cancelReason: null,
      declinedAt: null,
      declineReason: null,
      hasQrCode: true,
      account: null,
    })
    expect(Date.parse(order.paidAt!)).toBeGreaterThanOrEqual(Date.parse(order.placedAt))
    expect(order.lines.map(({ id: _, ...line }) => line)).toEqual([
      {
        kind: 'ticket',
        name: 'Standard',
        variant: [],
        merchandiseItemId: null,
        variantId: null,
        quantity: 1,
        unitAmountMinor: 10000,
        amountMinor: 10000,
        handedOutAt: null,
      },
      {
        kind: 'add_on',
        name: 'Room',
        variant: [],
        merchandiseItemId: null,
        variantId: null,
        quantity: 1,
        unitAmountMinor: 2500,
        amountMinor: 2500,
        handedOutAt: null,
      },
      {
        kind: 'merchandise',
        name: 'T-shirt',
        variant: [expect.any(String) as string],
        merchandiseItemId: shirt.id,
        variantId: shirt.variantId,
        quantity: 2,
        unitAmountMinor: 5000,
        amountMinor: 10000,
        handedOutAt: null,
      },
    ])
    expect(order.answers).toEqual([{ fieldId: city, label: 'City', answer: 'Gdynia' }])
    // The version accepted is the one in force when the order was placed: the last published.
    expect(order.consents.map(({ acceptedAt: _, ...consent }) => consent)).toEqual([
      {
        consentId: accepted,
        text: 'I accept the rules',
        document: { title: 'Rules', versionId: rules.versionIds[1], number: 2 },
      },
      { consentId: newsletter, text: 'Send me news', document: null },
    ])
    expect(order.attempts).toEqual([
      {
        id: expect.any(String) as string,
        provider: 'fake',
        status: 'paid',
        amountMinor: 22500,
        paidAmountMinor: 22500,
        startedAt: expect.any(String) as string,
        paidAt: expect.any(String) as string,
        confirmedAt: expect.any(String) as string,
        moneyWith: 'convention',
        failureReason: null,
        failureCode: null,
        failureMessage: null,
        information: expect.any(Object) as Record<string, string>,
      },
    ])
    expect(order.emails).toEqual([
      {
        id: expect.any(String) as string,
        kind: 'order-confirmation',
        recipient: 'buyer@example.test',
        queuedAt: expect.any(String) as string,
        sentAt: null,
        failedAttempts: 0,
      },
    ])
    // The code is its buyer's alone: the page says only that there is one.
    expect(JSON.stringify(res.body)).not.toMatch(/qrCode"|codeHash|resultToken/)
  })

  it('shows what was paid beside the total, the cause of a review and the account an order is on', async () => {
    const d = await orderDesk(app)
    const buyer = await member()
    const placed = await d.place({ email: buyer.email })
    await d.pay(placed, { amountMinor: 9000 })

    const order = (await d.head('get', `/orders/${placed.orderId}`).expect(200)).body as OrderDetail

    expect(order).toMatchObject({
      status: 'needs-review',
      reviewCause: 'amount',
      totalMinor: 10000,
      paidMinor: 9000,
      hasQrCode: false,
      account: null,
      paidAt: null,
    })
    expect(order.attempts[0]).toMatchObject({ amountMinor: 10000, paidAmountMinor: 9000 })
    expect(order.emails.map((email) => email.kind).sort()).toEqual([
      'needs-review',
      'payment-under-review',
    ])

    // A paid order under the confirmed email of an account is on that account.
    const mine = await d.paid({ email: buyer.email })
    expect(
      ((await d.head('get', `/orders/${mine.orderId}`).expect(200)).body as OrderDetail).account,
    ).toBe(buyer.email)
  })

  it('shows an order that came once what it held was gone as needing review for that', async () => {
    const d = await orderDesk(app)
    const placed = await d.place()

    // Its hold ended, and the one place the ticket type has went to another order.
    await d.paidLate(placed, async () => {
      await setColumn('ticket_types', d.standard, 'capacity', 1)
      await addOrder(d.t.id, d.edition, { status: 'paid', ticketTypeId: d.standard })
    })

    const order = (await d.head('get', `/orders/${placed.orderId}`).expect(200)).body as OrderDetail
    expect(order).toMatchObject({
      status: 'needs-review',
      reviewCause: 'unavailable',
      holds: false,
    })
  })

  it('is no page for an order of another edition, of another convention or for no identifier', async () => {
    const d = await orderDesk(app)
    const other = await orderDesk(app)
    const sibling = await addEdition(d.t.id)
    const elsewhere = await addOrder(d.t.id, sibling)
    const foreign = await addOrder(other.t.id, other.edition)
    const mine = await addOrder(d.t.id, d.edition)

    await d.head('get', `/orders/${mine.id}`).expect(200)
    for (const id of [elsewhere.id, foreign.id, 'no-identifier', mine.number]) {
      const res = await d.head('get', `/orders/${id}`).expect(404)
      expect(res.body).toMatchObject({ code: 'request.not-found' })
    }
  })
})

describe('who reads an edition’s orders', () => {
  it('an org with tickets read access reads them, and one without reads none', async () => {
    const d = await orderDesk(app)
    const sibling = await addEdition(d.t.id)
    const mine = await addOrder(d.t.id, d.edition)
    const [reader, elsewhere] = [await member(), await member()]
    await addEditionAccess(d.t.id, await addOrg(d.t.id, reader), d.edition, { tickets: 'read' })
    await addEditionAccess(d.t.id, await addOrg(d.t.id, elsewhere), sibling, { tickets: 'write' })

    expect(numbers(await d.as(reader, 'get', '/orders').expect(200))).toEqual([mine.number])
    await d.as(reader, 'get', `/orders/${mine.id}`).expect(200)
    await d.as(elsewhere, 'get', '/orders').expect(403)
    await d.as(elsewhere, 'get', `/orders/${mine.id}`).expect(403)
  })
})
