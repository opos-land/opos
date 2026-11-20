import { type NestExpressApplication } from '@nestjs/platform-express'
import { type ProductionNumbers } from '@opos/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { deleteCreatedAccounts } from './auth'
import { type OrderDesk, orderDesk } from './order-desk'
import {
  addEdition,
  addMerchandiseItem,
  addOrder,
  addVariant,
  closeTenantDb,
  deleteCreatedTenants,
  setCatalogSettings,
  setColumn,
} from './tenants'

// The production numbers of an edition's merchandise (docs/specs/0006-order-management.md, S2
// and S3): the count of every variant, to send to the manufacturer once the pre-order deadline
// has passed, as a file too.

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
const at = (minutes: number) => new Date(Date.now() + minutes * MINUTE).toISOString()
const numbers = (res: { body: unknown }) => res.body as ProductionNumbers
const deadline = (d: OrderDesk, moment: string | null) =>
  setCatalogSettings(d.t.id, d.edition, { merchPreorderDeadline: moment })

/** A shirt in a sized variant and a plain one, a pin, and orders of each status holding them. */
async function merchandise(d: OrderDesk) {
  const shirt = await addMerchandiseItem(d.t.id, d.edition, {
    name: 'Shirt',
    sized: true,
    stock: null,
  })
  const plain = await addVariant(d.t.id, d.edition, shirt.id, null)
  const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 50 })
  const of = (variantId: string, quantity: number, itemId = shirt.id) => ({
    variants: [{ itemId, variantId, quantity }],
  })
  await addOrder(d.t.id, d.edition, { status: 'paid', ...of(shirt.variantId, 2) })
  await addOrder(d.t.id, d.edition, { status: 'paid', ...of(pin.variantId, 4, pin.id) })
  await addOrder(d.t.id, d.edition, {
    status: 'paid-manual',
    email: null,
    manualReason: 'desk',
    ...of(shirt.variantId, 1),
  })
  await addOrder(d.t.id, d.edition, { status: 'awaiting-payment', ...of(shirt.variantId, 3) })
  // In review it is counted whether or not it kept its hold.
  await addOrder(d.t.id, d.edition, {
    status: 'needs-review',
    holds: false,
    ...of(shirt.variantId, 1),
  })
  await addOrder(d.t.id, d.edition, { status: 'needs-review', ...of(plain, 2) })
  // What nobody will pick up is no part of the numbers.
  for (const status of ['expired', 'declined', 'canceled']) {
    await addOrder(d.t.id, d.edition, { status, holds: false, ...of(shirt.variantId, 7) })
  }
  return { shirt, plain, pin }
}

describe('the production numbers', () => {
  it('count every variant: what paid orders hold, and apart from it what awaits payment and needs review', async () => {
    const d = await orderDesk(app)
    const { shirt, plain, pin } = await merchandise(d)
    await deadline(d, at(-1))

    const res = await d.head('get', '/production-numbers').expect(200)

    expect(Date.parse(numbers(res).deadline!)).toBeLessThan(Date.now())
    const [shirts, pins] = numbers(res).items
    expect(shirts).toMatchObject({ itemId: shirt.id, name: 'Shirt' })
    // The variants of an item come in the order the catalog lists them.
    expect(shirts!.variants).toHaveLength(2)
    expect(shirts!.variants).toEqual(
      expect.arrayContaining([
        {
          variantId: shirt.variantId,
          labels: [expect.any(String) as string],
          paid: 3,
          awaitingPayment: 3,
          needsReview: 1,
        },
        { variantId: plain, labels: [], paid: 0, awaitingPayment: 0, needsReview: 2 },
      ]),
    )
    expect([pins]).toEqual([
      {
        itemId: pin.id,
        name: 'Pin',
        variants: [
          { variantId: pin.variantId, labels: [], paid: 4, awaitingPayment: 0, needsReview: 0 },
        ],
      },
    ])
  })

  it('are refused until the pre-order deadline has passed, and wait for none where none is set', async () => {
    const d = await orderDesk(app)
    await merchandise(d)

    await deadline(d, at(60))
    for (const path of ['/production-numbers', '/production-numbers/export']) {
      const res = await d.head('get', path).expect(409)
      expect(res.body).toMatchObject({ code: 'production.before-deadline' })
    }

    await deadline(d, null)
    const res = await d.head('get', '/production-numbers').expect(200)
    expect(numbers(res).deadline).toBeNull()
    expect(numbers(res).items).toHaveLength(2)
    await d.head('get', '/production-numbers/export').expect(200)
  })

  it('count no order and no item of another edition', async () => {
    const d = await orderDesk(app)
    const sibling = await addEdition(d.t.id)
    const pin = await addMerchandiseItem(d.t.id, d.edition, { name: 'Pin', stock: 5 })
    const other = await addMerchandiseItem(d.t.id, sibling, { name: 'Elsewhere', stock: 5 })
    await addOrder(d.t.id, sibling, {
      status: 'paid',
      variants: [{ itemId: other.id, variantId: other.variantId, quantity: 9 }],
    })

    const res = await d.head('get', '/production-numbers').expect(200)

    expect(numbers(res).items).toEqual([
      {
        itemId: pin.id,
        name: 'Pin',
        variants: [
          { variantId: pin.variantId, labels: [], paid: 0, awaitingPayment: 0, needsReview: 0 },
        ],
      },
    ])
  })

  it('are a file too, named after the edition, with its columns in the language of who asked', async () => {
    const d = await orderDesk(app)
    await merchandise(d)
    await deadline(d, at(-1))

    const res = await d.head('get', '/production-numbers/export').buffer(true).expect(200)

    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="production-numbers-${d.slug}.csv"`,
    )
    expect(res.headers['cache-control']).toBe('private, no-store')
    const rows = res.text.split('\r\n')
    // No language is asked for and the account chose none: the convention's, Polish by default.
    expect(rows[0]).toBe(
      '\uFEFF"Gadżet";"Wariant";"Opłacone";"Oczekujące na płatność";"Do wyjaśnienia"',
    )
    expect(rows.slice(1, 3).sort()).toEqual([
      '"Shirt";"";0;0;2',
      expect.stringMatching(/^"Shirt";"[^"]+";3;3;1$/) as string,
    ])
    expect(rows.slice(3)).toEqual(['"Pin";"";4;0;0', ''])

    // In the language the panel shows, which it sends with every request: the file reads as
    // the table on the screen does.
    const english = '\uFEFF"Merchandise item";"Variant";"Paid";"Awaiting payment";"Needs review"'
    const asked = await d
      .head('get', '/production-numbers/export')
      .set('Accept-Language', 'en')
      .buffer(true)
      .expect(200)
    expect(asked.text.split('\r\n')[0]).toBe(english)
    // Asked with no language, it is in the one the account chose.
    await setColumn('accounts', d.t.head.id, 'locale', 'en')
    const chosen = await d.head('get', '/production-numbers/export').buffer(true).expect(200)
    expect(chosen.text.split('\r\n')[0]).toBe(english)
  })
})
