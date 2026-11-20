import { type NestExpressApplication } from '@nestjs/platform-express'
import { type OrderDetail } from '@opos/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import { orderDesk, whilePlacing } from './order-desk'
import {
  addAddOn,
  addMerchandiseItem,
  addOrder,
  addOrderLink,
  addQrCode,
  addVariant,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  offerWith,
  openTransaction,
} from './tenants'

// What an org corrects of a paid order (docs/specs/0006-order-management.md, C1-C6): the ticket
// holder's name, the order's email and the variant of a merchandise line. Each tells the buyer
// what changed; a manual order has no email to change and gets none.

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
const notCorrectable = { code: 'order.not-correctable' }
/** Every status but the two a correction is made on. */
const OTHERS = ['awaiting-payment', 'expired', 'needs-review', 'declined', 'canceled'] as const

/** A stored order but for its ticket holder's name and the moment it last changed. */
const besidesName = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).filter(([column]) => column !== 'holder_name' && column !== 'updated_at'),
  )

describe('the ticket holder’s name', () => {
  it('is changed, and nothing else of the order with it', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    const before = await d.order(placed.orderId)
    const codes = await d.stored('order_qr_code_orders')

    const res = await d
      .head('patch', `/orders/${placed.orderId}/holder`, { holderName: '  Grace Hopper ' })
      .expect(200)

    expect(detail(res)).toMatchObject({ holderName: 'Grace Hopper', email: 'buyer@example.test' })
    expect(besidesName(await d.order(placed.orderId))).toEqual(besidesName(before))
    // The QR code the buyer holds stays the one the order carries.
    expect(await d.stored('order_qr_code_orders')).toEqual(codes)
    expect(await d.emails(placed.orderId)).toEqual([
      ['order-confirmation', 'buyer@example.test'],
      ['order-holder-changed', 'buyer@example.test'],
    ])
  })

  it('is changed on a manual order, which has nobody to email', async () => {
    const d = await orderDesk(app)
    const manual = await addOrder(d.t.id, d.edition, {
      status: 'paid-manual',
      email: null,
      manualReason: 'desk',
    })

    const res = await d
      .head('patch', `/orders/${manual.id}/holder`, { holderName: 'Grace Hopper' })
      .expect(200)

    expect(detail(res).holderName).toBe('Grace Hopper')
    expect(await d.emails(manual.id)).toEqual([])
  })

  it('tells the buyer nothing when the name is the one the order has', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()

    await d
      .head('patch', `/orders/${placed.orderId}/holder`, { holderName: 'Ada Lovelace' })
      .expect(200)

    expect(await d.emails(placed.orderId)).toEqual([['order-confirmation', 'buyer@example.test']])
  })

  it.each(OTHERS)('is not changed on an order that is %s', async (status) => {
    const d = await orderDesk(app)
    const order = await addOrder(d.t.id, d.edition, { status, holds: false })

    const res = await d
      .head('patch', `/orders/${order.id}/holder`, { holderName: 'Grace Hopper' })
      .expect(409)

    expect(res.body).toMatchObject(notCorrectable)
    expect((await d.order(order.id)).holder_name).toBe('Ada')
  })

  it('is a name: one of spaces alone, a field of its own and another edition’s order are refused', async () => {
    const d = await orderDesk(app)
    const other = await orderDesk(app)
    const placed = await d.paid()
    const foreign = await addOrder(other.t.id, other.edition, { status: 'paid' })

    await d.head('patch', `/orders/${placed.orderId}/holder`, { holderName: '   ' }).expect(400)
    await d
      .head('patch', `/orders/${placed.orderId}/holder`, { holderName: 'Ada', email: 'x@y.test' })
      .expect(400)
    await d.head('patch', `/orders/${foreign.id}/holder`, { holderName: 'Ada' }).expect(404)
  })
})

describe('the email of an order', () => {
  it('gives the order a new QR code and ends its links, and both addresses are emailed', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    const link = await addOrderLink(d.t.id, d.edition, placed.orderId)
    const [carried] = await d.stored('order_qr_code_orders')

    const res = await d
      .head('put', `/orders/${placed.orderId}/email`, { email: ' Moved@Example.test ' })
      .expect(200)

    expect(detail(res)).toMatchObject({ email: 'moved@example.test', hasQrCode: true })
    const codes = await d.stored('order_qr_codes')
    const old = codes.find((code) => code.id === carried!.qr_code_id)!
    expect(old.replaced_at).not.toBeNull()
    // The order carries another code, of another hash, sealed for its own row.
    const [now] = await d.stored('order_qr_code_orders')
    expect(now!.qr_code_id).not.toBe(old.id)
    const fresh = codes.find((code) => code.id === now!.qr_code_id)!
    expect(fresh).toMatchObject({ replaced_at: null })
    expect(fresh.code_hash).not.toBe(old.code_hash)
    expect(fresh.code).not.toMatch(/^[A-Z2-7]{32}$/)
    // The link sent to the old address opens nothing any more.
    const [ended] = (await d.stored('order_links')).filter((row) => row.id === link)
    expect(ended!.ended_at).not.toBeNull()
    expect(await d.emails(placed.orderId)).toEqual([
      ['order-confirmation', 'buyer@example.test'],
      ['order-email-changed', 'moved@example.test'],
      ['order-email-replaced', 'buyer@example.test'],
    ])
    // Found by the code it carries now alone.
    const found = async (hash: unknown) =>
      (await d.head('get', `/orders?qrCodeHash=${String(hash)}`).expect(200)).body as {
        total: number
      }
    expect((await found(fresh.code_hash)).total).toBe(1)
    expect((await found(old.code_hash)).total).toBe(0)
  })

  it('leaves the order on the account it was on', async () => {
    const d = await orderDesk(app)
    const buyer = await member()
    const placed = await d.paid({ email: buyer.email })
    const attached = await d.stored('order_accounts')
    expect(attached).toHaveLength(1)

    const res = await d
      .head('put', `/orders/${placed.orderId}/email`, { email: 'friend@example.test' })
      .expect(200)

    expect(detail(res)).toMatchObject({ email: 'friend@example.test', account: buyer.email })
    expect(await d.stored('order_accounts')).toEqual(attached)
  })

  it('changes nothing for the address the order has already', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()
    const codes = await d.stored('order_qr_codes')

    await d
      .head('put', `/orders/${placed.orderId}/email`, { email: 'BUYER@example.test' })
      .expect(200)

    expect(await d.stored('order_qr_codes')).toEqual(codes)
    expect(await d.emails(placed.orderId)).toEqual([['order-confirmation', 'buyer@example.test']])
  })

  it('keeps a code that another order still carries', async () => {
    const d = await orderDesk(app)
    const [mine, other] = [
      await addOrder(d.t.id, d.edition, { status: 'paid' }),
      await addOrder(d.t.id, d.edition, { status: 'paid' }),
    ]
    const shared = await addQrCode(d.t.id, d.edition, mine.id, 'S'.repeat(32))
    const adding = await openTransaction()
    await adding.sql`
      insert into order_qr_code_orders (tenant_id, edition_id, order_id, qr_code_id)
      values (${d.t.id}, ${d.edition}, ${other.id}, ${shared})
    `
    await adding.commit()

    await d.head('put', `/orders/${mine.id}/email`, { email: 'moved@example.test' }).expect(200)

    const codes = await d.stored('order_qr_codes')
    expect(codes.find((code) => code.id === shared)!.replaced_at).toBeNull()
    const carried = await d.stored('order_qr_code_orders')
    expect(carried.find((row) => row.order_id === other.id)!.qr_code_id).toBe(shared)
    expect(carried.find((row) => row.order_id === mine.id)!.qr_code_id).not.toBe(shared)
  })

  it('is not changed on a manual order, which has none, nor on an order that is not paid', async () => {
    const d = await orderDesk(app)
    const manual = await addOrder(d.t.id, d.edition, {
      status: 'paid-manual',
      email: null,
      manualReason: 'invoice',
    })
    const refused = [manual]
    for (const status of OTHERS) {
      refused.push(await addOrder(d.t.id, d.edition, { status, holds: false }))
    }

    for (const order of refused) {
      const res = await d
        .head('put', `/orders/${order.id}/email`, { email: 'moved@example.test' })
        .expect(409)
      expect(res.body).toMatchObject(notCorrectable)
    }
    expect(await d.stored('order_qr_codes')).toEqual([])
    expect(await d.stored('order_emails')).toEqual([])
  })

  it('is an address: anything else is refused', async () => {
    const d = await orderDesk(app)
    const placed = await d.paid()

    for (const body of [{ email: 'nobody' }, { email: '' }, {}, { email: 'a@b.test', x: 1 }]) {
      await d.head('put', `/orders/${placed.orderId}/email`, body).expect(400)
    }
    expect((await d.order(placed.orderId)).email).toBe('buyer@example.test')
  })
})

describe('the variant of a merchandise line', () => {
  /** A shirt in two variants, and a paid order of two of the first. */
  async function shirts(stock: { first: number; second: number | null }) {
    const d = await orderDesk(app)
    const shirt = await addMerchandiseItem(d.t.id, d.edition, { name: 'Shirt', stock: stock.first })
    const second = await addVariant(d.t.id, d.edition, shirt.id, stock.second)
    await offerWith(d.t.id, d.edition, d.standard, { itemIds: [shirt.id] })
    const placed = await d.paid({
      cart: {
        ticket: { ticketTypeId: d.standard },
        items: [{ variantId: shirt.variantId, quantity: 2 }],
      },
      expectedTotalMinor: 20000,
    })
    const order = detail(await d.head('get', `/orders/${placed.orderId}`).expect(200))
    const line = order.lines.find((held) => held.kind === 'merchandise')!
    const swap = (variantId: string, lineId = line.id) =>
      d.head('put', `/orders/${placed.orderId}/lines/${lineId}/variant`, { variantId })
    /** Whether the shop still sells two of a variant: what the stock leaves of it. */
    const sells = (variantId: string) =>
      d
        .place({
          cart: { ticket: { ticketTypeId: d.standard }, items: [{ variantId, quantity: 2 }] },
          expectedTotalMinor: 20000,
        })
        .then(
          () => true,
          () => false,
        )
    return { d, shirt, second, placed, order, line, swap, sells }
  }

  it('is swapped for another variant of its item, and the stock moves between them', async () => {
    const s = await shirts({ first: 2, second: 2 })

    const res = await s.swap(s.second).expect(200)

    const line = detail(res).lines.find((held) => held.kind === 'merchandise')!
    expect(line).toMatchObject({
      id: s.line.id,
      variantId: s.second,
      merchandiseItemId: s.shirt.id,
      quantity: 2,
      amountMinor: 10000,
    })
    expect(detail(res).totalMinor).toBe(20000)
    expect(await s.d.emails(s.placed.orderId)).toEqual([
      ['order-confirmation', 'buyer@example.test'],
      ['order-variant-changed', 'buyer@example.test'],
    ])
    // The two of the first variant are back in the shop, and the second has none left.
    expect(await s.sells(s.second)).toBe(false)
    expect(await s.sells(s.shirt.variantId)).toBe(true)
  })

  it('is refused when the other variant has too few left', async () => {
    const s = await shirts({ first: 2, second: 1 })

    const res = await s.swap(s.second).expect(409)

    expect(res.body).toMatchObject({
      code: 'order.unavailable',
      params: { kind: 'variant', id: s.second },
    })
    expect(await s.d.emails(s.placed.orderId)).toEqual([
      ['order-confirmation', 'buyer@example.test'],
    ])
  })

  it('is refused against an order placed meanwhile, which took the last of the other variant', async () => {
    const s = await shirts({ first: 2, second: 2 })

    const res = await whilePlacing(
      (sql) => sql`select id from merchandise_variants where id = ${s.second} for update`,
      () => s.swap(s.second),
      async (sql) => {
        const [order] = await sql<{ id: string }[]>`
          insert into orders (tenant_id, edition_id, number, status, email, holder_name,
            total_minor, holds, result_token_hash)
          values (${s.d.t.id}, ${s.d.edition}, 'MEANWH2222', 'paid', 'other@example.test', 'Other',
            5000, true, repeat('0', 64))
          returning id
        `
        await sql`
          insert into order_lines (tenant_id, edition_id, order_id, kind, merchandise_item_id,
            merchandise_variant_id, quantity, unit_amount_minor, amount_minor)
          values (${s.d.t.id}, ${s.d.edition}, ${order!.id}, 'merchandise', ${s.shirt.id},
            ${s.second}, 1, 5000, 5000)
        `
      },
    )

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'order.unavailable' })
  })

  it('takes a variant with no limit, and changes nothing for the variant the line has', async () => {
    const s = await shirts({ first: 2, second: null })

    await s.swap(s.shirt.variantId).expect(200)
    expect(await s.d.emails(s.placed.orderId)).toHaveLength(1)

    await s.swap(s.second).expect(200)
    expect(await s.d.emails(s.placed.orderId)).toHaveLength(2)
  })

  it('takes no variant of another item, and swaps no line that is not merchandise', async () => {
    const s = await shirts({ first: 2, second: 2 })
    const mug = await addMerchandiseItem(s.d.t.id, s.d.edition, { name: 'Mug', stock: 5 })
    const room = await addAddOn(s.d.t.id, s.d.edition)
    const ticket = s.order.lines.find((held) => held.kind === 'ticket')!

    await s.swap(mug.variantId).expect(404)
    await s.swap(room).expect(404)
    await s.swap(s.second, ticket.id).expect(404)
    await s.swap(s.second, s.shirt.id).expect(404)
    await s.swap('no-identifier').expect(400)
    expect(await s.d.emails(s.placed.orderId)).toHaveLength(1)
  })

  it.each(OTHERS)('is not swapped on an order that is %s', async (status) => {
    const d = await orderDesk(app)
    const shirt = await addMerchandiseItem(d.t.id, d.edition, { stock: 5 })
    const second = await addVariant(d.t.id, d.edition, shirt.id, 5)
    const order = await addOrder(d.t.id, d.edition, {
      status,
      holds: false,
      variants: [{ itemId: shirt.id, variantId: shirt.variantId, quantity: 1 }],
    })
    const [line] = (await d.stored('order_lines')).filter((row) => row.order_id === order.id)

    const res = await d
      .head('put', `/orders/${order.id}/lines/${String(line!.id)}/variant`, { variantId: second })
      .expect(409)

    expect(res.body).toMatchObject(notCorrectable)
  })
})
