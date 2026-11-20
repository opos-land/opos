import { describe, expect, it } from 'vitest'
import {
  myOrderSchema,
  myOrdersContract,
  openedOrderLinkSchema,
  orderLinksContract,
  orderLinkTokenSchema,
} from './buyer-orders'
import { contract } from './index'
import { ORDER_EMAIL_KINDS, ORG_EMAIL_KINDS } from './orders'

// docs/specs/0009-buyer-self-service.md: the order link, K1-K4.

const order = {
  number: 'ABCDEFGHJK',
  status: 'paid',
  placedAt: '2027-05-01T10:00:00.000Z',
  convention: { slug: 'pyrkon', name: 'Pyrkon', timezone: 'Europe/Warsaw' },
  edition: {
    slug: '2027',
    name: 'Pyrkon 2027',
    startsAt: '2027-06-01T08:00:00.000Z',
    endsAt: '2027-06-03T18:00:00.000Z',
  },
  lines: [{ kind: 'ticket', name: 'Standard', variant: [], quantity: 1, amountMinor: 12000 }],
  totalMinor: 12000,
  currency: 'PLN',
  qrCode: 'A'.repeat(32),
  pickupInformation: null,
}

describe('the token of an order link', () => {
  it('is a text of 20 to 200 characters', () => {
    expect(orderLinkTokenSchema.safeParse('a'.repeat(43)).success).toBe(true)
    for (const token of ['', 'a'.repeat(19), 'a'.repeat(201), 42, null]) {
      expect(orderLinkTokenSchema.safeParse(token).success, String(token)).toBe(false)
    }
  })

  it('travels in the body of a request, never in an address of the API', () => {
    for (const route of Object.values(orderLinksContract)) {
      const { method, path } = route['~orpc'].route
      expect(method).toBe('POST')
      expect(path).not.toMatch(/[{?]/)
    }
    expect(contract.orderLinks).toBe(orderLinksContract)
  })
})

describe('what an order link opens', () => {
  it('is the order as its page shows it, or only that the link expired', () => {
    expect(openedOrderLinkSchema.parse({ state: 'valid', order })).toEqual({
      state: 'valid',
      order,
    })
    expect(openedOrderLinkSchema.parse({ state: 'expired' })).toEqual({ state: 'expired' })
  })

  // K2 and the spec's tests: the page of a link carries no email address.
  it('carries nothing of the buyer or the ticket holder', () => {
    const opened = openedOrderLinkSchema.parse({
      state: 'valid',
      order: { ...order, email: 'buyer@example.test', holderName: 'Ada' },
    })

    expect(JSON.stringify(opened)).not.toMatch(/buyer@example\.test|Ada/)
    // An expired link shows nothing of the order.
    expect(openedOrderLinkSchema.parse({ state: 'expired', order })).toEqual({ state: 'expired' })
  })
})

describe('the email with a fresh order link', () => {
  it('is an email of an order, for its buyer', () => {
    expect(ORDER_EMAIL_KINDS).toContain('order-link')
    expect(ORG_EMAIL_KINDS).not.toContain('order-link')
    // And so is the reminder before the edition (docs/specs/0011-pre-edition-reminder.md).
    expect(ORDER_EMAIL_KINDS).toContain('pre-edition-reminder')
    expect(ORG_EMAIL_KINDS).not.toContain('pre-edition-reminder')
  })
})

// docs/specs/0009-buyer-self-service.md, U1-U4.
describe("an account's orders in a convention", () => {
  const mine = {
    id: '0198c1a0-0000-7000-8000-000000000001',
    number: 'ABCDEFGHJK',
    status: 'paid',
    placedAt: '2027-05-01T10:00:00.000Z',
    holdEndsAt: null,
    holderName: 'Ada',
    edition: { id: '0198c1a0-0000-7000-8000-000000000002', slug: '2027', name: 'Pyrkon 2027' },
    lines: order.lines,
    totalMinor: 12000,
    currency: 'PLN',
    bought: {
      ticketTypeId: '0198c1a0-0000-7000-8000-000000000003',
      addOnIds: [],
      itemIds: [],
    },
  }

  it('are listed with what each holds and what "Buy more" would add to', () => {
    expect(myOrderSchema.parse(mine)).toEqual(mine)
    // An order that is not paid adds to nothing.
    const awaiting = {
      ...mine,
      status: 'awaiting-payment',
      holdEndsAt: '2027-05-01T10:30:00.000Z',
      bought: null,
    }
    expect(myOrderSchema.parse(awaiting)).toEqual(awaiting)
    expect(JSON.stringify(myOrderSchema.parse({ ...mine, email: 'a@b.test' }))).not.toMatch(/a@b/)
  })

  it('are read and acted on under the tenant, by the account they belong to', () => {
    expect(contract.myOrders).toBe(myOrdersContract)
    expect(myOrdersContract.list['~orpc'].route).toMatchObject({
      method: 'GET',
      path: '/orders/mine',
    })
    expect(myOrdersContract.resendConfirmation['~orpc'].route).toMatchObject({
      method: 'POST',
      path: '/orders/mine/{orderId}/resend-confirmation',
      successStatus: 204,
    })
    for (const route of Object.values(myOrdersContract)) {
      expect(route['~orpc'].meta).toMatchObject({ tenant: true })
    }
  })
})
