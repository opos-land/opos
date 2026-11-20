import { type NestExpressApplication } from '@nestjs/platform-express'
import { type OrderDetail } from '@opos/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import { type OrderDesk, orderDesk, whilePlacing } from './order-desk'
import {
  addAddOn,
  addCustomField,
  addMerchandiseItem,
  addTicketType,
  closeShop,
  closeTenantDb,
  deleteCreatedTenants,
  offerWith,
  setColumn,
} from './tenants'

// A sale made outside the shop, recorded by an org in the panel
// (docs/specs/0006-order-management.md, M1-M6): a desk sale, one paid by invoice or a
// complimentary one. It takes stock and capacity like any order and is priced as the shop
// prices it at that moment; it has no email, no QR code and nothing to scan.

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

const detail = (res: { body: unknown }) => res.body as OrderDetail
const MINUTE = 60_000
const at = (minutes: number) => new Date(Date.now() + minutes * MINUTE).toISOString()
/** A desk sale of one ticket of the desk's ticket type, as the screen would send it. */
const sale = (d: OrderDesk, changes: Record<string, unknown> = {}) => ({
  reason: 'desk',
  cart: { ticket: { ticketTypeId: d.standard } },
  ageBand: 'adult',
  ...changes,
})
const record = (d: OrderDesk, changes: Record<string, unknown> = {}) =>
  d.head('post', '/orders/manual', sale(d, changes))
/** Whether the shop sells one more ticket: what the capacity leaves of the ticket type. */
const sells = (d: OrderDesk) =>
  d.place().then(
    () => true,
    () => false,
  )

describe('a manual order', () => {
  it('records a desk sale at the prices in force, with its lines handed out', async () => {
    const d = await orderDesk(app)
    const room = await addAddOn(d.t.id, d.edition, { name: 'Room', amountMinor: 2500 })
    const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 5 })
    await offerWith(d.t.id, d.edition, d.standard, { addOnIds: [room], itemIds: [pin.id] })
    const before = Date.now()

    const res = await record(d, {
      cart: {
        ticket: { ticketTypeId: d.standard },
        addOnIds: [room],
        items: [{ variantId: pin.variantId, quantity: 2 }],
      },
      holderName: ' Ada Lovelace ',
      note: 'Paid in cash',
    }).expect(201)

    const order = detail(res)
    expect(order).toMatchObject({
      status: 'paid-manual',
      manualReason: 'desk',
      note: 'Paid in cash',
      email: null,
      holderName: 'Ada Lovelace',
      ageBand: 'adult',
      totalMinor: 10000 + 2500 + 2 * 5000,
      paidMinor: 0,
      holds: true,
      // It has no QR code, sends no email and is on no account.
      hasQrCode: false,
      account: null,
      emails: [],
      attempts: [],
      consents: [],
    })
    expect(order.number).toMatch(/^[2-9A-HJKMNP-Z]{10}$/)
    expect(Date.parse(order.paidAt!)).toBeGreaterThanOrEqual(before - 1000)
    expect(order.lines.map((line) => [line.kind, line.name, line.amountMinor])).toEqual([
      ['ticket', 'Standard', 10000],
      ['add_on', 'Room', 2500],
      ['merchandise', 'Pin', 10000],
    ])
    // What it sells is handed over as it is recorded.
    for (const line of order.lines) {
      expect(Date.parse(line.handedOutAt!)).toBeGreaterThanOrEqual(before - 1000)
    }
    expect((await d.order(order.id)).hold_ends_at).toBeNull()
    expect(await d.stored('order_qr_codes')).toEqual([])
    expect(await d.stored('order_accounts')).toEqual([])
  })

  it.each([
    ['invoice', 'Invoice 7/2026', 15000],
    // A complimentary order sells the same catalog for nothing.
    ['complimentary', null, 0],
  ] as const)('records a sale of the reason %s', async (reason, note, totalMinor) => {
    const d = await orderDesk(app)
    const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 5 })
    await offerWith(d.t.id, d.edition, d.standard, { itemIds: [pin.id] })

    const res = await record(d, {
      reason,
      ...(note && { note }),
      cart: {
        ticket: { ticketTypeId: d.standard },
        items: [{ variantId: pin.variantId, quantity: 1 }],
      },
    }).expect(201)

    expect(detail(res)).toMatchObject({
      status: 'paid-manual',
      manualReason: reason,
      note,
      totalMinor,
    })
    expect(detail(res).lines.map((line) => line.amountMinor)).toEqual(
      reason === 'complimentary' ? [0, 0] : [10000, 5000],
    )
  })

  it('takes stock and capacity like any order, and is refused with what ran out', async () => {
    const d = await orderDesk(app)
    await setColumn('ticket_types', d.standard, 'capacity', 1)
    const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 1 })
    await offerWith(d.t.id, d.edition, d.standard, { itemIds: [pin.id] })
    const pins = { ticket: null, items: [{ variantId: pin.variantId, quantity: 1 }] }

    await record(d).expect(201)

    expect(await sells(d)).toBe(false)
    const ticket = await record(d).expect(409)
    expect(ticket.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'ticket-type', id: d.standard },
    })
    await record(d, { cart: pins, ageBand: null }).expect(201)
    const variant = await record(d, { cart: pins, ageBand: null }).expect(409)
    expect(variant.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'variant', id: pin.variantId },
    })
    expect(await d.stored('orders')).toHaveLength(2)
  })

  it('is refused against an order placed meanwhile, which took the last seat', async () => {
    const d = await orderDesk(app)
    await setColumn('ticket_types', d.standard, 'capacity', 1)

    const res = await whilePlacing(
      (sql) => sql`select id from ticket_types where id = ${d.standard} for update`,
      () => record(d),
      async (sql) => {
        const [order] = await sql<{ id: string }[]>`
          insert into orders (tenant_id, edition_id, number, status, email, holder_name,
            total_minor, holds, result_token_hash)
          values (${d.t.id}, ${d.edition}, 'MEANWH2222', 'paid', 'other@example.test', 'Other',
            10000, true, repeat('0', 64))
          returning id
        `
        await sql`
          insert into order_lines (tenant_id, edition_id, order_id, kind, ticket_type_id,
            quantity, unit_amount_minor, amount_minor)
          values (${d.t.id}, ${d.edition}, ${order!.id}, 'ticket', ${d.standard}, 1, 10000, 10000)
        `
      },
    )

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'order.unavailable' })
    expect(await d.stored('orders')).toHaveLength(1)
  })

  // A sale outside the shop does not wait for the shop: it is recorded while the shop is
  // closed, and sells merchandise alone whatever the shop lets a buyer do.
  it('is recorded while the shop is closed, and sells merchandise alone', async () => {
    const d = await orderDesk(app)
    const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 5 })
    await closeShop(d.edition)

    const res = await record(d, {
      cart: { ticket: null, items: [{ variantId: pin.variantId, quantity: 2 }] },
      ageBand: null,
    }).expect(201)

    expect(detail(res)).toMatchObject({ totalMinor: 10000, holderName: '', ageBand: null })
    await record(d).expect(201)
  })

  it('is priced at the tier in force, and sells no ticket type that has none', async () => {
    const d = await orderDesk(app)
    const tiered = await addTicketType(d.t.id, d.edition, {
      name: 'Tiered',
      tiers: [
        { amountMinor: 8000, startsAt: at(-120), endsAt: at(-60) },
        { amountMinor: 15000, startsAt: at(-60), endsAt: at(60) },
      ],
    })
    const over = await addTicketType(d.t.id, d.edition, {
      name: 'Over',
      saleEndsAt: at(-1),
    })

    const res = await record(d, { cart: { ticket: { ticketTypeId: tiered } } }).expect(201)

    expect(detail(res).totalMinor).toBe(15000)
    const refused = await record(d, { cart: { ticket: { ticketTypeId: over } } }).expect(409)
    expect(refused.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'ticket-type', id: over },
    })
  })

  it('takes an age band the ticket type allows, and requires neither a name nor an answer', async () => {
    const d = await orderDesk(app)
    const adults = await addTicketType(d.t.id, d.edition, { name: 'Adults', ageBands: ['adult'] })
    const city = await addCustomField(d.t.id, d.edition, { label: 'City', isRequired: true })
    const hidden = await addCustomField(d.t.id, d.edition, { label: 'Old', hidden: true })
    const cart = { ticket: { ticketTypeId: adults } }

    // No name and no answer, though the field is required of a buyer.
    const bare = await record(d, { cart }).expect(201)
    expect(detail(bare)).toMatchObject({ holderName: '', answers: [], ageBand: 'adult' })

    const answered = await record(d, {
      cart,
      customFieldAnswers: [{ fieldId: city, answer: ' Gdynia ' }],
    }).expect(201)
    expect(detail(answered).answers).toEqual([{ fieldId: city, label: 'City', answer: 'Gdynia' }])

    for (const changes of [
      { ageBand: 'child' },
      { ageBand: null },
      { customFieldAnswers: [{ fieldId: hidden, answer: 'x' }] },
      { customFieldAnswers: [{ fieldId: adults, answer: 'x' }] },
      {
        customFieldAnswers: [
          { fieldId: city, answer: 'a' },
          { fieldId: city, answer: 'b' },
        ],
      },
    ]) {
      const res = await record(d, { cart, ...changes }).expect(400)
      expect(res.body).toMatchObject({ code: 'request.invalid' })
    }
  })

  it('has no ticket holder without a ticket: no age band, and no answer', async () => {
    const d = await orderDesk(app)
    const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 5 })
    const city = await addCustomField(d.t.id, d.edition, { label: 'City' })
    const cart = { ticket: null, items: [{ variantId: pin.variantId, quantity: 1 }] }

    await record(d, { cart, ageBand: 'adult' }).expect(400)
    await record(d, {
      cart,
      ageBand: null,
      customFieldAnswers: [{ fieldId: city, answer: 'x' }],
    }).expect(400)
    const empty = await record(d, { cart: { ticket: null }, ageBand: null }).expect(409)
    expect(empty.body).toMatchObject({ code: 'order.unavailable', params: { kind: 'empty' } })
  })

  it('is no order of the shop: an email, a consent and an unknown reason are refused', async () => {
    const d = await orderDesk(app)

    for (const changes of [
      { reason: 'gift' },
      { email: 'buyer@example.test' },
      { consentIds: [] },
      { note: 'n'.repeat(501) },
    ]) {
      await record(d, changes).expect(400)
    }
    expect(await d.stored('orders')).toEqual([])
  })
})
