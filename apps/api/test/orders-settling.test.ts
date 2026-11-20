import { type NestExpressApplication } from '@nestjs/platform-express'
import { type OrderDetail } from '@opos/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import { type OrderDesk, orderDesk, whilePlacing } from './order-desk'
import {
  addEdition,
  addOrder,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  setColumn,
} from './tenants'

// Canceling a paid order and settling one that needs review
// (docs/specs/0006-order-management.md, X1-X5 and R2-R5). OPOS returns no money: a cancellation
// and a decline change the order alone, and what it held goes back on sale.

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
const reason = { reason: 'The buyer asked for it' }
/** Whether the shop sells one more ticket: what the capacity leaves of the ticket type. */
const sells = (d: OrderDesk) =>
  d.place({ email: 'next@example.test' }).then(
    () => true,
    () => false,
  )
/** A convention whose ticket type has room for one ticket alone. */
async function oneSeat() {
  const d = await orderDesk(app)
  await setColumn('ticket_types', d.standard, 'capacity', 1)
  return d
}
/** An order in review that kept its hold: its payment was of another amount than its total. */
async function inReview(d: OrderDesk, email = 'buyer@example.test') {
  const placed = await d.place({ email })
  await d.pay(placed, { amountMinor: 9000 })
  return placed
}

describe('canceling an order', () => {
  it('cancels a paid order of the shop: what it held returns, and the buyer is told', async () => {
    const d = await oneSeat()
    const placed = await d.paid()
    expect(await sells(d)).toBe(false)

    const res = await d.head('post', `/orders/${placed.orderId}/cancel`, reason).expect(200)

    expect(detail(res)).toMatchObject({
      status: 'canceled',
      holds: false,
      cancelReason: 'The buyer asked for it',
      // The code stays on the order, for the scanner to say why it is refused.
      hasQrCode: true,
      totalMinor: 10000,
      paidMinor: 10000,
    })
    expect(Date.parse(detail(res).canceledAt!)).toBeGreaterThan(Date.now() - 60_000)
    expect(await d.emails(placed.orderId)).toEqual([
      ['order-confirmation', 'buyer@example.test'],
      ['order-canceled', 'buyer@example.test'],
    ])
    expect(await sells(d)).toBe(true)
  })

  it('cancels a manual order, and emails nobody', async () => {
    const d = await oneSeat()
    const manual = await addOrder(d.t.id, d.edition, {
      status: 'paid-manual',
      email: null,
      manualReason: 'desk',
      ticketTypeId: d.standard,
    })
    expect(await sells(d)).toBe(false)

    const res = await d.head('post', `/orders/${manual.id}/cancel`, reason).expect(200)

    expect(detail(res)).toMatchObject({ status: 'canceled', holds: false, manualReason: 'desk' })
    expect(await d.emails(manual.id)).toEqual([])
    expect(await sells(d)).toBe(true)
  })

  // A cancellation is only a cancellation: nothing else of the order goes with it.
  it('leaves a canceled order on the account it was on', async () => {
    const d = await orderDesk(app)
    const buyer = await member()
    const placed = await d.paid({ email: buyer.email })
    const attached = await d.stored('order_accounts')

    const res = await d.head('post', `/orders/${placed.orderId}/cancel`, reason).expect(200)

    expect(detail(res).status).toBe('canceled')
    expect(await d.stored('order_accounts')).toEqual(attached)
  })

  it.each(['awaiting-payment', 'expired', 'needs-review', 'declined', 'canceled'] as const)(
    'cancels no order that is %s',
    async (status) => {
      const d = await orderDesk(app)
      const order = await addOrder(d.t.id, d.edition, { status, holds: false })

      const res = await d.head('post', `/orders/${order.id}/cancel`, reason).expect(409)

      expect(res.body).toMatchObject({ code: 'order.not-cancelable' })
      expect((await d.order(order.id)).status).toBe(status)
      expect(await d.emails(order.id)).toEqual([])
    },
  )

  it('needs a reason, and cancels no order of another convention', async () => {
    const d = await orderDesk(app)
    const other = await orderDesk(app)
    const placed = await d.paid()
    const foreign = await addOrder(other.t.id, other.edition, { status: 'paid' })

    for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(501) }]) {
      await d.head('post', `/orders/${placed.orderId}/cancel`, body).expect(400)
    }
    await d.head('post', `/orders/${foreign.id}/cancel`, reason).expect(404)
    expect((await d.order(placed.orderId)).status).toBe('paid')
    expect((await other.order(foreign.id)).status).toBe('paid')
  })
})

describe('marking an order in review paid', () => {
  it('pays an order that kept its hold as it is, at the total it was placed at', async () => {
    const d = await orderDesk(app)
    const placed = await inReview(d)

    const res = await d.head('post', `/orders/${placed.orderId}/mark-paid`).expect(200)

    expect(detail(res)).toMatchObject({
      status: 'paid',
      holds: true,
      // The difference is settled by the convention, outside OPOS: the page shows both.
      totalMinor: 10000,
      paidMinor: 9000,
      reviewCause: 'amount',
      hasQrCode: true,
    })
    expect(Date.parse(detail(res).paidAt!)).toBeGreaterThan(Date.now() - 60_000)
    expect((await d.order(placed.orderId)).hold_ends_at).toBeNull()
    expect((await d.emails(placed.orderId)).map(([kind]) => kind).sort()).toEqual([
      'needs-review',
      'order-confirmation',
      'payment-under-review',
    ])
  })

  it('puts the order on the account whose confirmed email it was placed under', async () => {
    const d = await orderDesk(app)
    const buyer = await member()
    const placed = await inReview(d, buyer.email)
    expect(await d.stored('order_accounts')).toEqual([])

    await d.head('post', `/orders/${placed.orderId}/mark-paid`).expect(200)

    expect(await d.stored('order_accounts')).toMatchObject([
      { order_id: placed.orderId, account_id: buyer.id },
    ])
  })

  it('takes again what the order let go of, and is refused while that is gone', async () => {
    const d = await oneSeat()
    const placed = await d.place()
    // The payment came once the hold had ended and the one seat went to another order.
    await d.paidLate(placed, () =>
      addOrder(d.t.id, d.edition, { status: 'paid', ticketTypeId: d.standard }),
    )
    expect(await d.order(placed.orderId)).toMatchObject({ status: 'needs-review', holds: false })

    const refused = await d.head('post', `/orders/${placed.orderId}/mark-paid`).expect(409)

    expect(refused.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'ticket-type', id: d.standard },
    })
    expect(await d.order(placed.orderId)).toMatchObject({ status: 'needs-review', holds: false })

    // The org raises the capacity first, and the order takes the seat it adds.
    await setColumn('ticket_types', d.standard, 'capacity', 2)
    const res = await d.head('post', `/orders/${placed.orderId}/mark-paid`).expect(200)

    expect(detail(res)).toMatchObject({ status: 'paid', holds: true, hasQrCode: true })
    expect(await sells(d)).toBe(false)
  })

  it('is refused against an order placed meanwhile, which took the last seat', async () => {
    const d = await oneSeat()
    const placed = await d.place()
    await d.paidLate(placed, () =>
      addOrder(d.t.id, d.edition, { status: 'paid', ticketTypeId: d.standard }),
    )
    await setColumn('ticket_types', d.standard, 'capacity', 2)

    const res = await whilePlacing(
      (sql) => sql`select id from ticket_types where id = ${d.standard} for update`,
      () => d.head('post', `/orders/${placed.orderId}/mark-paid`),
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
    expect(await d.order(placed.orderId)).toMatchObject({ status: 'needs-review', holds: false })
  })

  it.each(['awaiting-payment', 'expired', 'paid', 'paid-manual', 'declined', 'canceled'] as const)(
    'marks no order paid that is %s',
    async (status) => {
      const d = await orderDesk(app)
      const order = await addOrder(d.t.id, d.edition, {
        status,
        holds: false,
        ...(status === 'paid-manual' && { email: null, manualReason: 'desk' as const }),
      })

      const res = await d.head('post', `/orders/${order.id}/mark-paid`).expect(409)

      expect(res.body).toMatchObject({ code: 'order.not-in-review' })
      expect((await d.order(order.id)).status).toBe(status)
      expect(await d.stored('order_qr_codes')).toEqual([])
    },
  )
})

describe('declining an order in review', () => {
  it('declines it with a reason: it holds nothing, gets no QR code, and the buyer is told', async () => {
    const d = await oneSeat()
    const placed = await inReview(d)
    expect(await sells(d)).toBe(false)

    const res = await d.head('post', `/orders/${placed.orderId}/decline`, reason).expect(200)

    expect(detail(res)).toMatchObject({
      status: 'declined',
      holds: false,
      declineReason: 'The buyer asked for it',
      hasQrCode: false,
      paidAt: null,
      paidMinor: 9000,
    })
    expect(Date.parse(detail(res).declinedAt!)).toBeGreaterThan(Date.now() - 60_000)
    expect((await d.emails(placed.orderId)).map(([kind]) => kind).sort()).toEqual([
      'needs-review',
      'order-declined',
      'payment-under-review',
    ])
    expect(await sells(d)).toBe(true)
    // Declined, it is settled: neither marked paid nor declined again.
    await d.head('post', `/orders/${placed.orderId}/mark-paid`).expect(409)
    await d.head('post', `/orders/${placed.orderId}/decline`, reason).expect(409)
  })

  it.each(['awaiting-payment', 'expired', 'paid', 'canceled'] as const)(
    'declines no order that is %s',
    async (status) => {
      const d = await orderDesk(app)
      const order = await addOrder(d.t.id, d.edition, { status, holds: false })

      const res = await d.head('post', `/orders/${order.id}/decline`, reason).expect(409)

      expect(res.body).toMatchObject({ code: 'order.not-in-review' })
      expect((await d.order(order.id)).status).toBe(status)
    },
  )

  it('needs a reason', async () => {
    const d = await orderDesk(app)
    const placed = await inReview(d)

    for (const body of [{}, { reason: ' ' }, { reason: 'x'.repeat(501) }]) {
      await d.head('post', `/orders/${placed.orderId}/decline`, body).expect(400)
    }
    expect((await d.order(placed.orderId)).status).toBe('needs-review')
  })
})

// The edition of the path is the one whose orders are settled, whatever RLS lets a request see.
describe('an order of another edition of the same convention', () => {
  it('is canceled, marked paid and declined by no route of this edition', async () => {
    const d = await orderDesk(app)
    const sibling = await addEdition(d.t.id)
    const paid = await addOrder(d.t.id, sibling, { status: 'paid' })
    const review = await addOrder(d.t.id, sibling, { status: 'needs-review' })

    await d.head('post', `/orders/${paid.id}/cancel`, reason).expect(404)
    await d.head('post', `/orders/${review.id}/mark-paid`).expect(404)
    await d.head('post', `/orders/${review.id}/decline`, reason).expect(404)
    expect((await d.order(paid.id)).status).toBe('paid')
    expect((await d.order(review.id)).status).toBe('needs-review')
  })
})
