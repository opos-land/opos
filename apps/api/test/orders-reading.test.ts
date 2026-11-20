import { createHash } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import {
  type OrderDetail,
  type OrderEmailDetail,
  type OrderEmailList,
  type OrderList,
} from '@opos/contract'
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
  addOrderEmail,
  addOrg,
  addQrCode,
  aQrCode,
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
    const [carried, replaced, unknown] = [aQrCode(), aQrCode(), aQrCode()]
    await addQrCode(d.t.id, d.edition, mine.id, carried)
    await addQrCode(d.t.id, d.edition, mine.id, replaced, true)
    const find = async (code: string) =>
      numbers(await d.head('get', `/orders?qrCodeHash=${hashOf(code)}`).expect(200))

    expect(await find(carried)).toEqual([mine.number])
    expect(await find(replaced)).toEqual([])
    expect(await find(unknown)).toEqual([])
    await d.head('get', `/orders?qrCodeHash=${carried}`).expect(400)
    // The code typed into the search of names and numbers finds nothing.
    expect(numbers(await d.head('get', `/orders?q=${carried}`).expect(200))).toEqual([])
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
    const codes = [aQrCode(), aQrCode()]
    await addQrCode(other.t.id, other.edition, foreign.id, codes[0]!)
    await addQrCode(d.t.id, sibling, elsewhere.id, codes[1]!)

    expect(numbers(await d.head('get', '/orders?q=shared').expect(200))).toEqual([mine.number])
    for (const code of codes) {
      const res = await d.head('get', `/orders?qrCodeHash=${hashOf(code)}`).expect(200)
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
    })
    // Whether an email address has an account is told to nobody: the page names none.
    expect(order).not.toHaveProperty('account')
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
        withdrawnAt: null,
        failedAttempts: 0,
      },
    ])
    // The code is its buyer's alone: the page says only that there is one.
    expect(JSON.stringify(res.body)).not.toMatch(/qrCode"|codeHash|resultToken/)
  })

  it('shows what was paid beside the total and the cause of a review, and no address of an org', async () => {
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
      paidAt: null,
    })
    expect(order.attempts[0]).toMatchObject({ amountMinor: 10000, paidAmountMinor: 9000 })
    // An alert goes to the heads and the orgs who settle the order. Their addresses stay
    // behind the team's own permission: the page says that the alert went, not to whom.
    expect(
      order.emails
        .map((email) => [email.kind, email.recipient])
        .sort(([a], [b]) => a!.localeCompare(b!)),
    ).toEqual([
      ['needs-review', null],
      ['payment-under-review', buyer.email],
    ])
    expect(JSON.stringify(order)).not.toContain(d.t.head.email)
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

// docs/specs/0006-order-management.md, F4: every email of the edition's orders in one list, and
// what each said.
describe('the emails of an edition’s orders', () => {
  const emails = (res: { body: unknown }) => res.body as OrderEmailList
  const SAID = { subject: 'Your order is paid', body: 'Thank you.\n\nThe QR code: […]\n\nOPOS' }

  it('lists every email with its order, the newest first, a page at a time', async () => {
    const d = await orderDesk(app)
    const ada = await addOrder(d.t.id, d.edition, { status: 'paid', email: 'ada@example.test' })
    const grace = await addOrder(d.t.id, d.edition, { email: 'grace@example.test' })
    const sent = await addOrderEmail(d.t.id, d.edition, ada.id, {
      recipient: 'ada@example.test',
      queuedAt: days(3),
      sentAt: days(3),
      ...SAID,
    })
    const failing = await addOrderEmail(d.t.id, d.edition, grace.id, {
      kind: 'order-expired',
      recipient: 'grace@example.test',
      queuedAt: days(2),
      failedAttempts: 2,
    })
    const withdrawn = await addOrderEmail(d.t.id, d.edition, ada.id, {
      kind: 'order-link',
      recipient: 'old@example.test',
      queuedAt: days(1),
      withdrawnAt: days(1),
    })

    const res = await d.head('get', '/order-emails').expect(200)

    expect(emails(res).total).toBe(3)
    expect(emails(res).emails.map((email) => email.id)).toEqual([withdrawn, failing, sent])
    expect(emails(res).emails[2]).toEqual({
      id: sent,
      kind: 'order-confirmation',
      recipient: 'ada@example.test',
      queuedAt: expect.any(String) as string,
      sentAt: expect.any(String) as string,
      withdrawnAt: null,
      failedAttempts: 0,
      order: { id: ada.id, number: ada.number },
    })
    expect(emails(res).emails[1]).toMatchObject({ sentAt: null, failedAttempts: 2 })
    expect(emails(res).emails[0]).toMatchObject({
      sentAt: null,
      withdrawnAt: expect.any(String) as string,
    })
    // The list says that an email went out, not what it said.
    expect(JSON.stringify(res.body)).not.toMatch(/Thank you|subject|body/)

    const page = await d.head('get', '/order-emails?limit=1&offset=1').expect(200)
    expect(emails(page).emails.map((email) => email.id)).toEqual([failing])
    expect(emails(page).total).toBe(3)
    await d.head('get', '/order-emails?limit=101').expect(400)
  })

  it('finds an email by a part of its address or of its order’s number', async () => {
    const d = await orderDesk(app)
    const ada = await addOrder(d.t.id, d.edition)
    const grace = await addOrder(d.t.id, d.edition)
    const toAda = await addOrderEmail(d.t.id, d.edition, ada.id, {
      recipient: 'countess@example.test',
    })
    const toGrace = await addOrderEmail(d.t.id, d.edition, grace.id, {
      recipient: 'admiral@navy.example.test',
    })
    // An alert to an org: who is in the team, and under which address, is not the list's to say.
    const alert = await addOrderEmail(d.t.id, d.edition, grace.id, {
      kind: 'needs-review',
      recipient: 'org-of-the-team@example.test',
    })
    const find = async (q: string) =>
      emails(await d.head('get', `/order-emails?q=${encodeURIComponent(q)}`).expect(200))
        .emails.map((email) => email.id)
        .sort()

    expect(await find('COUNTESS')).toEqual([toAda])
    expect(await find('navy.example')).toEqual([toGrace])
    expect(await find(grace.number.slice(2, 8).toLowerCase())).toEqual([toGrace, alert].sort())
    expect(await find('org-of-the-team')).toEqual([])
    // What a pattern reads as "anything" is searched as it is written.
    expect(await find('%')).toEqual([])
    const all = emails(await d.head('get', '/order-emails').expect(200))
    expect(all.emails.find((email) => email.id === alert)).toMatchObject({ recipient: null })
    expect(JSON.stringify(all)).not.toContain('org-of-the-team')
  })

  it('shows what an email said, and nothing for one that did not go out', async () => {
    const d = await orderDesk(app)
    const mine = await addOrder(d.t.id, d.edition, { status: 'paid' })
    const sent = await addOrderEmail(d.t.id, d.edition, mine.id, { sentAt: days(1), ...SAID })
    const before = await addOrderEmail(d.t.id, d.edition, mine.id, { sentAt: days(2) })
    const queued = await addOrderEmail(d.t.id, d.edition, mine.id, { kind: 'order-link' })
    const alert = await addOrderEmail(d.t.id, d.edition, mine.id, {
      kind: 'payment-not-needed-orgs',
      recipient: 'org-of-the-team@example.test',
      sentAt: days(1),
      subject: 'A payment to return',
      body: 'The money is with the convention.',
    })
    const one = async (id: string) =>
      (await d.head('get', `/order-emails/${id}`).expect(200)).body as OrderEmailDetail

    expect(await one(sent)).toEqual({
      id: sent,
      kind: 'order-confirmation',
      recipient: 'buyer@example.test',
      queuedAt: expect.any(String) as string,
      sentAt: expect.any(String) as string,
      withdrawnAt: null,
      failedAttempts: 0,
      order: { id: mine.id, number: mine.number },
      ...SAID,
    })
    // Sent before texts were kept, and not sent yet.
    expect(await one(before)).toMatchObject({ sentAt: expect.any(String) as string, body: null })
    expect(await one(queued)).toMatchObject({ sentAt: null, subject: null, body: null })
    expect(await one(alert)).toMatchObject({
      recipient: null,
      body: 'The money is with the convention.',
    })
  })

  it('holds no email of another edition or of another convention', async () => {
    const d = await orderDesk(app)
    const other = await orderDesk(app)
    const sibling = await addEdition(d.t.id)
    const mine = await addOrderEmail(d.t.id, d.edition, (await addOrder(d.t.id, d.edition)).id)
    const elsewhere = await addOrderEmail(d.t.id, sibling, (await addOrder(d.t.id, sibling)).id)
    const foreign = await addOrderEmail(
      other.t.id,
      other.edition,
      (await addOrder(other.t.id, other.edition)).id,
    )

    const res = await d.head('get', '/order-emails').expect(200)

    expect(emails(res).emails.map((email) => email.id)).toEqual([mine])
    expect(emails(res).total).toBe(1)
    await d.head('get', `/order-emails/${mine}`).expect(200)
    for (const id of [elsewhere, foreign, 'no-identifier']) {
      const missing = await d.head('get', `/order-emails/${id}`).expect(404)
      expect(missing.body).toMatchObject({ code: 'request.not-found' })
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
    // The emails of the orders are read with the orders.
    const email = await addOrderEmail(d.t.id, d.edition, mine.id)
    await d.as(reader, 'get', '/order-emails').expect(200)
    await d.as(reader, 'get', `/order-emails/${email}`).expect(200)
    await d.as(elsewhere, 'get', '/order-emails').expect(403)
    await d.as(elsewhere, 'get', `/order-emails/${email}`).expect(403)
  })
})
