import { type NestExpressApplication } from '@nestjs/platform-express'
import { type OrderDetail } from '@opos/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTE_RATE_LIMITS } from '../src/common/rate-limit/route-rate-limit'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import { type OrderDesk, orderDesk } from './order-desk'
import {
  addEdition,
  addMerchandiseItem,
  addOrder,
  addTicketType,
  closeTenantDb,
  deleteCreatedTenants,
  offerWith,
} from './tenants'

// Resending an order's confirmation, and marking a hand-out on an order's page for a buyer whose
// QR code cannot be read (docs/specs/0006-order-management.md, S1, H1 and H2).

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
const notPaid = { code: 'order.not-paid' }
const UNPAID = ['awaiting-payment', 'expired', 'needs-review', 'declined', 'canceled'] as const

describe('resending the confirmation', () => {
  it('queues the confirmation again for the order’s email, with the QR code the order has', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    const codes = await d.stored('order_qr_codes')

    const res = await d.head('post', `/orders/${placed.orderId}/resend-confirmation`).expect(200)

    expect(detail(res).emails.map((email) => [email.kind, email.recipient, email.sentAt])).toEqual([
      ['order-confirmation', 'buyer@example.test', null],
      ['order-confirmation', 'buyer@example.test', null],
    ])
    // The same code: the outbox opens the one the order carries, and makes each email a link
    // of its own.
    expect(await d.stored('order_qr_codes')).toEqual(codes)
    expect(await d.stored('order_qr_code_orders')).toHaveLength(1)
  })

  it('goes to the address the order has now', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    await d
      .head('put', `/orders/${placed.orderId}/email`, { email: 'moved@example.test' })
      .expect(200)

    await d.head('post', `/orders/${placed.orderId}/resend-confirmation`).expect(200)

    expect((await d.emails(placed.orderId)).at(-1)).toEqual([
      'order-confirmation',
      'moved@example.test',
    ])
  })

  // A manual order has no QR code and nobody to send one to.
  it.each([...UNPAID, 'paid-manual'] as const)(
    'resends nothing of an order that is %s',
    async (status) => {
      const d = await orderDesk(app)
      const order = await addOrder(d.t.id, d.edition, {
        status,
        holds: false,
        ...(status === 'paid-manual' && { email: null, manualReason: 'desk' as const }),
      })

      const res = await d.head('post', `/orders/${order.id}/resend-confirmation`).expect(409)

      expect(res.body).toMatchObject(notPaid)
      expect(await d.emails(order.id)).toEqual([])
    },
  )

  it('is resent only so often for one order', async () => {
    const d = await orderDesk(app)
    const [first, second] = [await d.paid(), await d.paid({ email: 'other@example.test' })]
    const { limit } = ROUTE_RATE_LIMITS.confirmationResends
    for (let sent = 0; sent < limit; sent += 1) {
      await d.head('post', `/orders/${first.orderId}/resend-confirmation`).expect(200)
    }

    const res = await d.head('post', `/orders/${first.orderId}/resend-confirmation`)

    expect(res.status).toBe(429)
    expect(res.body).toMatchObject({ code: 'request.rate-limited' })
    expect(res.headers['retry-after']).toBeDefined()
    expect(await d.emails(first.orderId)).toHaveLength(limit + 1)
    // Another order has a count of its own.
    await d.head('post', `/orders/${second.orderId}/resend-confirmation`).expect(200)
  })
})

describe('handing out on the page of an order', () => {
  /** A paid order of a ticket and two pins, with its two lines. */
  async function withPins(d: OrderDesk) {
    const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 5 })
    await offerWith(d.t.id, d.edition, d.standard, { itemIds: [pin.id] })
    const placed = await d.paid({
      cart: {
        ticket: { ticketTypeId: d.standard },
        items: [{ variantId: pin.variantId, quantity: 2 }],
      },
      expectedTotalMinor: 20000,
    })
    const order = detail(await d.head('get', `/orders/${placed.orderId}`).expect(200))
    const [ticket, pins] = order.lines
    const handOut = (lineIds: string[]) =>
      d.head('post', `/orders/${placed.orderId}/hand-outs`, { lineIds })
    const takeBack = (lineId: string) =>
      d.head('delete', `/orders/${placed.orderId}/lines/${lineId}/hand-out`)
    return { placed, ticket: ticket!, pins: pins!, handOut, takeBack }
  }
  const marks = (res: { body: unknown }) =>
    detail(res).lines.map((line) => line.handedOutAt !== null)

  it('marks the lines named as handed out, with the time', async () => {
    const d = await orderDesk(app)
    const o = await withPins(d)
    const before = Date.now()

    const entry = await o.handOut([o.ticket.id]).expect(200)

    expect(marks(entry)).toEqual([true, false])
    expect(Date.parse(detail(entry).lines[0]!.handedOutAt!)).toBeGreaterThanOrEqual(before - 1000)
    expect(marks(await o.handOut([o.pins.id]).expect(200))).toEqual([true, true])
  })

  it('refuses a line already handed out, and marks none of the others with it', async () => {
    const d = await orderDesk(app)
    const o = await withPins(d)
    await o.handOut([o.ticket.id]).expect(200)

    const res = await o.handOut([o.pins.id, o.ticket.id]).expect(409)

    expect(res.body).toMatchObject({
      code: 'scan.already-handed-out',
      params: { lineId: o.ticket.id },
    })
    const now = await d.head('get', `/orders/${o.placed.orderId}`).expect(200)
    expect(marks(now)).toEqual([true, false])
  })

  it('lets one of two marks made at the same moment through', async () => {
    const d = await orderDesk(app)
    const o = await withPins(d)

    const answers = await Promise.all([o.handOut([o.ticket.id]), o.handOut([o.ticket.id])])

    expect(answers.map((res) => res.status).sort()).toEqual([200, 409])
  })

  it('takes a mark back, whoever made it', async () => {
    const d = await orderDesk(app)
    const o = await withPins(d)
    await o.handOut([o.ticket.id, o.pins.id]).expect(200)

    expect(marks(await o.takeBack(o.ticket.id).expect(200))).toEqual([false, true])
    // Nothing to take back changes nothing.
    expect(marks(await o.takeBack(o.ticket.id).expect(200))).toEqual([false, true])
    // Marked again once it was taken back.
    expect(marks(await o.handOut([o.ticket.id]).expect(200))).toEqual([true, true])

    // The lines of a manual order are handed out as it is recorded: that mark too.
    const manual = detail(
      await d
        .head('post', '/orders/manual', {
          reason: 'desk',
          cart: { ticket: { ticketTypeId: d.standard } },
          ageBand: 'adult',
        })
        .expect(201),
    )
    const back = await d
      .head('delete', `/orders/${manual.id}/lines/${manual.lines[0]!.id}/hand-out`)
      .expect(200)
    expect(marks(back)).toEqual([false])
  })

  it.each(UNPAID)('hands out nothing of an order that is %s', async (status) => {
    const d = await orderDesk(app)
    const order = await addOrder(d.t.id, d.edition, {
      status,
      holds: false,
      ticketTypeId: d.standard,
    })
    const [line] = (await d.stored('order_lines')).filter((row) => row.order_id === order.id)

    const res = await d
      .head('post', `/orders/${order.id}/hand-outs`, { lineIds: [line!.id] })
      .expect(409)

    expect(res.body).toMatchObject(notPaid)
  })

  it('knows the lines of its own order alone', async () => {
    const d = await orderDesk(app)
    const o = await withPins(d)
    const other = await withPins(d)

    await o.handOut([other.ticket.id]).expect(404)
    await o.handOut([o.ticket.id, other.pins.id]).expect(404)
    await o.takeBack(other.ticket.id).expect(404)
    await o.takeBack('no-identifier').expect(404)
    for (const lineIds of [[], ['no-identifier'], [o.ticket.id, o.ticket.id]]) {
      await o.handOut(lineIds).expect(400)
    }
    const now = await d.head('get', `/orders/${o.placed.orderId}`).expect(200)
    expect(marks(now)).toEqual([false, false])
  })
})

// The edition of the path is the one whose orders are resent and handed out.
describe('an order of another edition of the same convention', () => {
  it('is resent and handed out by no route of this edition', async () => {
    const d = await orderDesk(app)
    const sibling = await addEdition(d.t.id)
    const type = await addTicketType(d.t.id, sibling)
    const elsewhere = await addOrder(d.t.id, sibling, { status: 'paid', ticketTypeId: type })
    const [line] = (await d.stored('order_lines')).filter((row) => row.order_id === elsewhere.id)
    const lineId = String(line!.id)

    await d.head('post', `/orders/${elsewhere.id}/resend-confirmation`).expect(404)
    await d.head('post', `/orders/${elsewhere.id}/hand-outs`, { lineIds: [lineId] }).expect(404)
    await d.head('delete', `/orders/${elsewhere.id}/lines/${lineId}/hand-out`).expect(404)
    expect(await d.emails(elsewhere.id)).toEqual([])
    const [now] = (await d.stored('order_lines')).filter((row) => row.id === line!.id)
    expect(now!.handed_out_at).toBeNull()
  })
})
