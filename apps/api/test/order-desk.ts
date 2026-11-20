import { type NestExpressApplication } from '@nestjs/platform-express'
import { type PlacedOrder, type StartedAttempt } from '@opos/contract'
import request from 'supertest'
import { STAND_IN_TOKEN } from '../src/modules/checkout/bot-check'
import { type FakeProvider } from '../src/modules/payments/fake-provider'
import { PROVIDER_MODULES } from '../src/modules/payments/payment-providers'
import { session } from './auth'
import {
  addEdition,
  addTicketType,
  connectFake,
  makeShopReady,
  type Member,
  openShop,
  setColumn,
  setPublished,
  storedRows,
  tenantWithHead,
} from './tenants'

// What the tests of order management share (docs/specs/0006-order-management.md): a convention
// that sells, orders placed and paid as a buyer does it, and the routes of an edition's orders
// called as a member.

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

type Row = Record<string, unknown>

/**
 * A tenant of its own with a published edition, an open shop, a connected fake provider account
 * and one ticket type at 100.00, so that a test changes nothing another reads.
 */
export async function orderDesk(app: NestExpressApplication) {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id)
  await setPublished(edition, true)
  await makeShopReady(t.id, edition)
  await connectFake(t.id)
  await openShop(t.id, edition)
  const standard = await addTicketType(t.id, edition, { name: 'Standard' })
  const editions = await request(app.getHttpServer()).get(`/public/tenants/${t.slug}/editions`)
  const slug = (editions.body as { slug: string }[])[0]!.slug
  const fake = () => app.get<Map<string, FakeProvider>>(PROVIDER_MODULES).get('fake')!

  /** A route of the edition's orders, called as a member of the team. */
  const as = (who: Member, method: Method, path: string, body?: object) => {
    const agent = request(app.getHttpServer())
    const req = agent[method](`/editions/${edition}${path}`)
      .use(session(who.token))
      .set('X-Tenant-Slug', t.slug)
    return body ? req.send(body) : req
  }
  const head = (method: Method, path: string, body?: object) => as(t.head, method, path, body)

  /** A visitor places an order for the ticket type; it awaits its payment. */
  const place = async (changes: Row = {}) => {
    const email = typeof changes.email === 'string' ? changes.email : 'buyer@example.test'
    const res = await request(app.getHttpServer())
      .post(`/public/tenants/${t.slug}/editions/${slug}/shop/orders`)
      .send({
        cart: { ticket: { ticketTypeId: standard } },
        holderName: 'Ada Lovelace',
        ageBand: 'adult',
        email,
        emailConfirmation: email,
        providerConsentAccepted: true,
        expectedTotalMinor: 10000,
        botCheckToken: STAND_IN_TOKEN,
        ...changes,
      })
      .expect(201)
    return res.body as PlacedOrder
  }

  /** The buyer goes to the fake provider to pay: the attempt this starts. */
  const start = async (order: PlacedOrder) => {
    const started = await request(app.getHttpServer())
      .post(`/public/tenants/${t.slug}/orders/${order.orderId}/payment-attempts`)
      .set('x-result-token', order.resultToken)
      .expect(201)
    return (started.body as StartedAttempt).redirectUrl.split('/').pop()!
  }

  /** The fake provider tells the API of a payment; `amountMinor` for another amount. */
  const confirm = async (attemptId: string, payment: { amountMinor?: number } = {}) => {
    await request(app.getHttpServer())
      .post(`/payments/fake/notifications/${attemptId}`)
      .send(fake().pay(attemptId, payment))
      .expect(200)
  }

  /** The buyer pays at the fake provider, which tells the API. */
  const pay = async (order: PlacedOrder, payment: { amountMinor?: number } = {}) => {
    const attemptId = await start(order)
    await confirm(attemptId, payment)
    return attemptId
  }

  /**
   * An order whose payment comes once its hold has ended: it expired meanwhile, and holds
   * nothing when the provider tells of the payment.
   */
  const paidLate = async (order: PlacedOrder, between: () => Promise<unknown>) => {
    const attemptId = await start(order)
    await setColumn('orders', order.orderId, 'status', 'expired')
    await setColumn('orders', order.orderId, 'holds', false)
    await between()
    await confirm(attemptId)
  }

  /** An order placed and paid in the shop. */
  const paid = async (changes: Row = {}) => {
    const order = await place(changes)
    await pay(order)
    return order
  }

  const stored = (table: string) => storedRows(table, t.id)
  const order = async (id: string) => (await stored('orders')).find((row) => row.id === id)!
  /** The emails queued of an order, by their kind and whom each is for. */
  const emails = async (orderId: string) =>
    (await stored('order_emails'))
      .filter((row) => row.order_id === orderId)
      .map((row) => [row.kind, row.recipient])

  return {
    t,
    edition,
    slug,
    standard,
    as,
    head,
    place,
    start,
    confirm,
    pay,
    paid,
    paidLate,
    stored,
    order,
    emails,
  }
}

export type OrderDesk = Awaited<ReturnType<typeof orderDesk>>
