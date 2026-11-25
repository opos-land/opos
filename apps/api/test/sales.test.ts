import { type NestExpressApplication } from '@nestjs/platform-express'
import { type Sales } from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTE_RATE_LIMITS } from '../src/common/rate-limit/route-rate-limit'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import { type OrderDesk, orderDesk } from './order-desk'
import {
  addAddOn,
  addCustomField,
  addEdition,
  addEditionAccess,
  addMerchandiseItem,
  addOrder,
  addOrderAnswer,
  addOrg,
  addPaymentAttempt,
  addQrCode,
  aQrCode,
  carryQrCode,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  setColumn,
} from './tenants'

// The reports of an edition's sales (docs/specs/0010-sales-reports.md): a dashboard that counts
// the orders as they are, and three lists an org takes away as files.

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

type Order = Parameters<typeof addOrder>[2]

/** A desk with a workshop, a headcount-only room, a pin and a custom field. */
async function desk() {
  const d = await orderDesk(app)
  const workshop = await addAddOn(d.t.id, d.edition, {
    name: 'Workshop',
    kind: 'limited',
    capacity: 9,
  })
  const room = await addAddOn(d.t.id, d.edition, { name: 'Sleeping room', kind: 'headcount' })
  const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 50 })
  const city = await addCustomField(d.t.id, d.edition, { label: 'City' })
  const order = (values: Order = {}) =>
    addOrder(d.t.id, d.edition, { status: 'paid', ticketTypeId: d.standard, ...values })
  const pins = (quantity: number) => [{ itemId: pin.id, variantId: pin.variantId, quantity }]
  return { d, workshop, room, pin, city, order, pins }
}

const sales = async (d: OrderDesk) => (await d.head('get', '/sales').expect(200)).body as Sales
/** The dashboard of another edition of the desk's convention, read by its head. */
const salesOf = async (d: OrderDesk, editionId: string) =>
  (
    await request(app.getHttpServer())
      .get(`/editions/${editionId}/sales`)
      .use(session(d.t.head.token))
      .set('X-Tenant-Slug', d.t.slug)
      .expect(200)
  ).body as Sales
/** A file as its rows of cells: the byte order mark gone, the quotes of each text taken off. */
const file = async (d: OrderDesk, path: string, language = 'en') => {
  const res = await d.head('get', path).set('Accept-Language', language).buffer(true).expect(200)
  const rows = res.text
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .filter((row) => row !== '')
    .map((row) => row.split(';').map((cell) => cell.replace(/^"|"$/g, '').replaceAll('""', '"')))
  return { res, header: rows[0]!, rows: rows.slice(1) }
}

// D1-D5.
describe('the dashboard of an edition’s sales', () => {
  it('counts what paid orders hold apart from what awaits payment or needs review, and nothing else', async () => {
    const { d, workshop, room, pin, order, pins } = await desk()
    await order({
      totalMinor: 15000,
      addOnIds: [workshop, room],
      variants: pins(2),
      ageBand: 'teen',
    })
    await order({ totalMinor: 10000, addOnIds: [room], ageBand: 'adult' })
    await order({ status: 'paid-manual', manualReason: 'desk', email: null, totalMinor: 7000 })
    await order({ status: 'awaiting-payment', variants: pins(3) })
    await order({ status: 'needs-review', reviewCause: 'amount', addOnIds: [workshop] })
    // An order that expired, was declined or was canceled counts nowhere.
    for (const status of ['expired', 'declined', 'canceled'] as const) {
      await order({ status, holds: false, addOnIds: [workshop, room], variants: pins(5) })
    }

    const report = await sales(d)

    expect(report).toMatchObject({
      currency: 'PLN',
      // What went through the provider apart from what an org recorded.
      revenue: { paidMinor: 25000, manualMinor: 7000 },
      orders: { paid: 2, manual: 1, awaitingPayment: 1, needsReview: 1 },
      ticketTypes: [{ id: d.standard, name: 'Standard', sold: 3, pending: 2 }],
      ageBands: { child: 0, teen: 1, adult: 2 },
    })
    expect(report.addOns).toEqual([
      { id: workshop, name: 'Workshop', kind: 'limited', sold: 1, pending: 1 },
      { id: room, name: 'Sleeping room', kind: 'headcount', sold: 2, pending: 0 },
    ])
    expect(report.items).toEqual([
      {
        id: pin.id,
        name: 'Pin',
        variants: [{ id: pin.variantId, labels: [], sold: 2, pending: 3 }],
      },
    ])
  })

  it('lists the answers to each custom field with how many paid orders gave each', async () => {
    const { d, city, order } = await desk()
    for (const answer of ['Poznań', 'Gdynia', 'Poznań']) {
      const paid = await order()
      await addOrderAnswer(d.t.id, d.edition, paid.id, city, answer)
    }
    const unpaid = await order({ status: 'expired', holds: false })
    await addOrderAnswer(d.t.id, d.edition, unpaid.id, city, 'Nowhere')

    const report = await sales(d)

    expect(report.customFields).toEqual([
      {
        id: city,
        label: 'City',
        answers: [
          { answer: 'Poznań', orders: 2 },
          { answer: 'Gdynia', orders: 1 },
        ],
      },
    ])
  })

  // D6: the sold orders by the day they were paid, in the convention's time zone.
  it('tells what was sold on each day, the day read in the time zone of the convention', async () => {
    const { d, order, pins } = await desk()
    await setColumn('tenants', d.t.id, 'timezone', 'Europe/Warsaw')
    const paidOn = async (at: string, values: Order = {}) => {
      const placed = await order(values)
      await setColumn('orders', placed.id, 'paid_at', at)
    }
    // Half past eleven at night in UTC is already the next day in Warsaw.
    await paidOn('2027-03-01T23:30:00Z', { totalMinor: 15000 })
    await paidOn('2027-03-02T10:00:00Z', { totalMinor: 10000 })
    await paidOn('2027-03-04T09:00:00Z', {
      status: 'paid-manual',
      manualReason: 'desk',
      email: null,
      totalMinor: 7000,
    })
    // An order of merchandise alone adds to the revenue of its day and to no ticket.
    const merch = await addOrder(d.t.id, d.edition, {
      status: 'paid',
      ageBand: null,
      totalMinor: 3000,
      variants: pins(2),
    })
    await setColumn('orders', merch.id, 'paid_at', '2027-03-04T11:00:00Z')
    // What is not sold is on no day, whenever it was placed or paid.
    await paidOn('2027-03-03T10:00:00Z', { status: 'canceled', holds: false })
    await order({ status: 'awaiting-payment', placedAt: '2027-03-03T10:00:00Z' })
    await order({ status: 'needs-review', reviewCause: 'amount', placedAt: '2027-03-03T10:00:00Z' })

    expect((await sales(d)).days).toEqual([
      { day: '2027-03-02', paidMinor: 25000, manualMinor: 0, tickets: 2 },
      { day: '2027-03-04', paidMinor: 3000, manualMinor: 7000, tickets: 1 },
    ])
  })

  it('counts a sold order with no time of payment on the day it was placed', async () => {
    const { d, order } = await desk()
    await order({ totalMinor: 5000, placedAt: '2027-03-05T12:00:00Z' })

    expect((await sales(d)).days).toEqual([
      { day: '2027-03-05', paidMinor: 5000, manualMinor: 0, tickets: 1 },
    ])
  })

  // The total of one order fits the database's four-byte integer; the sum of an edition's need not.
  it('sums a revenue larger than the largest total one order may carry', async () => {
    const { d, order } = await desk()
    for (let placed = 0; placed < 3; placed += 1) {
      await order({ totalMinor: 1_000_000_000, placedAt: '2027-03-05T12:00:00Z' })
    }

    const report = await sales(d)

    expect(report.revenue).toEqual({ paidMinor: 3_000_000_000, manualMinor: 0 })
    expect(report.days).toEqual([
      { day: '2027-03-05', paidMinor: 3_000_000_000, manualMinor: 0, tickets: 3 },
    ])
  })

  it('is empty for an edition that sold nothing, and reads its own edition alone', async () => {
    const { d, order } = await desk()
    const sibling = await addEdition(d.t.id)
    await order()

    expect((await sales(d)).revenue.paidMinor).toBe(10000)
    // Another edition of the convention has sold nothing: it shares no number with this one.
    expect(await salesOf(d, sibling)).toMatchObject({
      revenue: { paidMinor: 0, manualMinor: 0 },
      orders: { paid: 0, manual: 0, awaitingPayment: 0, needsReview: 0 },
      ticketTypes: [],
      addOns: [],
      items: [],
      ageBands: { child: 0, teen: 0, adult: 0 },
      customFields: [],
      days: [],
    })
  })
})

// E1-E7.
describe('the ticket holder list', () => {
  it('has a row for each order with a ticket: who holds it, what with, and the order’s email', async () => {
    const { d, workshop, room, city, order, pins } = await desk()
    const ada = await order({
      holderName: 'Ada Lovelace',
      ageBand: 'teen',
      email: 'ada@example.test',
      addOnIds: [workshop, room],
      placedAt: '2027-05-31T22:30:00Z',
    })
    await addOrderAnswer(d.t.id, d.edition, ada.id, city, 'Poznań')
    const manual = await order({
      status: 'paid-manual',
      manualReason: 'desk',
      email: null,
      holderName: '',
      ageBand: null,
      placedAt: '2027-06-01T09:00:00Z',
    })
    // An order of merchandise alone has no ticket holder; an expired one holds no ticket.
    await addOrder(d.t.id, d.edition, { status: 'paid', ageBand: null, variants: pins(1) })
    await order({ status: 'expired', holds: false })

    const { res, header, rows } = await file(d, '/exports/ticket-holders')

    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="ticket-holders-${d.slug}.csv"`,
    )
    expect(res.headers['cache-control']).toBe('private, no-store')
    expect(res.text.startsWith('\uFEFF')).toBe(true)
    expect(header).toEqual([
      'Order number',
      'Status',
      'Ticket holder',
      'Age band',
      'Ticket type',
      'Add-ons',
      'City',
      'Email',
      'Placed',
    ])
    expect(rows).toEqual([
      // A moment near midnight is written in the convention's time zone: the next day in Warsaw.
      [
        ada.number,
        'Paid',
        'Ada Lovelace',
        'Teen',
        'Standard',
        'Workshop, Sleeping room',
        'Poznań',
        'ada@example.test',
        '2027-06-01 00:30',
      ],
      [manual.number, 'Paid - manual', '', '', 'Standard', '', '', '', '2027-06-01 11:00'],
    ])
  })

  // A "Buy more" order holds no ticket: what it bought is listed on the ticket of its QR code.
  it('lists on a ticket the add-ons of every paid order on its QR code', async () => {
    const { d, workshop, room, order } = await desk()
    const ada = await order({ holderName: 'Ada', placedAt: '2027-03-01T10:00:00Z' })
    const code = await addQrCode(d.t.id, d.edition, ada.id, aQrCode())
    const more = async (status: string, addOnIds: string[]) => {
      const added = await addOrder(d.t.id, d.edition, { status, ageBand: null, addOnIds })
      await carryQrCode(d.t.id, d.edition, added.id, code)
    }
    await more('paid', [workshop])
    await more('paid', [room])
    // An order on the code that nobody paid for, or that was canceled, adds nothing.
    await more('awaiting-payment', [room])
    await more('canceled', [room])
    // Another ticket keeps its own add-ons alone.
    const grace = await order({ holderName: 'Grace', placedAt: '2027-03-02T10:00:00Z' })
    await addQrCode(d.t.id, d.edition, grace.id, aQrCode())

    const { rows } = await file(d, '/exports/ticket-holders')

    expect(rows.map((row) => [row[0], row[5]])).toEqual([
      [ada.number, 'Workshop, Sleeping room'],
      [grace.number, ''],
    ])
  })

  it('names its columns in the language asked for', async () => {
    const { d, order } = await desk()
    await order()

    const { header, rows } = await file(d, '/exports/ticket-holders', 'pl')

    expect(header.slice(0, 3)).toEqual(['Numer zamówienia', 'Status', 'Posiadacz akredytacji'])
    expect(rows[0]![1]).toBe('Opłacone')
  })
})

describe('the merchandise pick list', () => {
  it('has a row for each merchandise line of a paid order, with whether it was handed out', async () => {
    const { d, order, pins } = await desk()
    const ada = await order({ holderName: 'Ada Lovelace', variants: pins(2) })
    const line = (await d.stored('order_lines')).find(
      (row) => row.order_id === ada.id && row.kind === 'merchandise',
    )!
    await setColumn('order_lines', String(line.id), 'handed_out_at', '2027-06-01T08:15:00Z')
    const manual = await order({
      status: 'paid-manual',
      manualReason: 'desk',
      email: null,
      holderName: '',
      variants: pins(1),
    })
    // What an unpaid order holds is nobody's to pick up yet.
    await order({ status: 'awaiting-payment', variants: pins(4) })

    const { res, header, rows } = await file(d, '/exports/merchandise-pick-list')

    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="merchandise-pick-list-${d.slug}.csv"`,
    )
    expect(header).toEqual([
      'Order number',
      'Name',
      'Merchandise item',
      'Variant',
      'Quantity',
      'Handed out',
    ])
    expect(rows).toEqual([
      [ada.number, 'Ada Lovelace', 'Pin', '', '2', '2027-06-01 10:15'],
      [manual.number, '', 'Pin', '', '1', ''],
    ])
  })
})

describe('the payments list', () => {
  it('has a row for each payment attempt: the amount to the cent, when it was paid and where the money is', async () => {
    const { d, order } = await desk()
    const paid = await order({ totalMinor: 12345 })
    await addPaymentAttempt(d.t.id, d.edition, paid.id, { status: 'failed', amountMinor: 12345 })
    await addPaymentAttempt(d.t.id, d.edition, paid.id, {
      amountMinor: 12345,
      paidAt: '2027-05-31T22:05:00Z',
      providerReference: 'TX-1',
      information: { transaction: 'TX-1', batch: '77', commissionMinor: '150', extra: 'kept' },
    })
    const refused = await order({ status: 'expired', holds: false })
    await addPaymentAttempt(d.t.id, d.edition, refused.id, { status: 'refused' })

    const { res, header, rows } = await file(d, '/exports/payments')

    expect(res.headers['content-disposition']).toBe(`attachment; filename="payments-${d.slug}.csv"`)
    expect(header).toEqual([
      'Order number',
      'Provider',
      'Attempt',
      'Amount',
      'Paid amount',
      'Currency',
      'Paid',
      'Money',
      'Transaction number',
      'Payout batch',
      'Commission',
      'Other details',
    ])
    const of = (number: string) => rows.filter((row) => row[0] === number)
    expect(of(paid.number)).toEqual([
      [paid.number, 'fake', 'Failed', '123.45', '', 'PLN', '', '', '', '', '', ''],
      [
        paid.number,
        'fake',
        'Paid',
        '123.45',
        '123.45',
        'PLN',
        '2027-06-01 00:05',
        'With the convention',
        'TX-1',
        '77',
        '1.50',
        'extra: kept',
      ],
    ])
    // A payment its order no longer needed, refused: the money stays with the buyer.
    const [returned] = of(refused.number)
    expect(returned!.slice(0, 6)).toEqual([
      refused.number,
      'fake',
      'Refused',
      '100.00',
      '100.00',
      'PLN',
    ])
    expect(returned![7]).toBe('With the buyer')

    // In Polish an amount carries a comma, which a spreadsheet set to Polish reads as a number.
    const polish = await file(d, '/exports/payments', 'pl')
    expect(polish.rows.find((row) => row[8] === 'TX-1')!.slice(2, 5)).toEqual([
      'Opłacona',
      '123,45',
      '123,45',
    ])
  })
})

describe('an exported file', () => {
  // E7: a text somebody typed never runs as a formula in a spreadsheet.
  it('writes a name and an answer that begin as a formula as text', async () => {
    const { d, city, order } = await desk()
    const evil = await order({ holderName: '=HYPERLINK("https://evil.test")' })
    await addOrderAnswer(d.t.id, d.edition, evil.id, city, '+48 600 100 200')

    const res = await d.head('get', '/exports/ticket-holders').buffer(true).expect(200)

    expect(res.text).toContain(`"'=HYPERLINK(""https://evil.test"")"`)
    expect(res.text).toContain(`"'+48 600 100 200"`)
  })

  it('is taken with tickets read access to the edition, and by nobody without it', async () => {
    const { d, order } = await desk()
    await order()
    const [reader, stranger] = [await member(), await member()]
    await addEditionAccess(d.t.id, await addOrg(d.t.id, reader), d.edition, { tickets: 'read' })
    await addOrg(d.t.id, stranger)
    const paths = [
      '/sales',
      '/exports/ticket-holders',
      '/exports/merchandise-pick-list',
      '/exports/payments',
    ]

    for (const path of paths) {
      await d.as(reader, 'get', path).expect(200)
      const refused = await d.as(stranger, 'get', path).expect(403)
      expect(refused.body).toMatchObject({ code: 'permission.denied' })
    }
  })

  it('is taken only so often by one account', async () => {
    const { d } = await desk()
    const { limit } = ROUTE_RATE_LIMITS.salesExports
    for (let taken = 0; taken < limit; taken += 1) {
      await d.head('get', '/exports/merchandise-pick-list').expect(200)
    }

    const res = await d.head('get', '/exports/payments')

    expect(res.status).toBe(429)
    expect(res.body).toMatchObject({ code: 'request.rate-limited' })
    // The dashboard is no export.
    await d.head('get', '/sales').expect(200)
  })
})
