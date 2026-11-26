import { z } from 'zod'
import { ORDER_STATUSES } from './checkout'
import { publicRoute, tenantRoute, timestamp } from './common'

// What a buyer does with an order once it is placed (docs/specs/0009-buyer-self-service.md).

/**
 * The token of an order link, as its email carries it. It travels in the body of a request,
 * never in a path or a query of the API, so no access log holds it.
 */
export const orderLinkTokenSchema = z.string().min(20).max(200)

const linkedLineSchema = z.object({
  /** A discount is a line of its own: what a code took off, below zero. */
  kind: z.enum(['ticket', 'add_on', 'merchandise', 'discount']),
  name: z.string(),
  /** The labels of a variant's values, in the order of its item's axes. */
  variant: z.array(z.string()),
  quantity: z.number().int().positive(),
  amountMinor: z.number().int(),
})

/**
 * An order as its link opens it (K2): its lines, its status, the QR code while it is paid, and
 * the edition's pick-up information. It carries nothing of the buyer or the ticket holder: the
 * link is all its reader proved.
 */
export const linkedOrderSchema = z.object({
  number: z.string(),
  status: z.enum(ORDER_STATUSES),
  placedAt: timestamp,
  convention: z.object({ slug: z.string(), name: z.string(), timezone: z.string() }),
  edition: z.object({
    slug: z.string(),
    name: z.string(),
    startsAt: timestamp,
    endsAt: timestamp,
  }),
  lines: z.array(linkedLineSchema),
  totalMinor: z.number().int(),
  currency: z.string(),
  /** The QR code the order carries, as text; null for an order that is not paid. */
  qrCode: z.string().nullable(),
  /** Where and when merchandise is handed over, when the edition says. */
  pickupInformation: z.string().nullable(),
})

export type LinkedOrder = z.infer<typeof linkedOrderSchema>

/** What a link opens: its order, or for an expired one only that it expired (K4). */
export const openedOrderLinkSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('valid'), order: linkedOrderSchema }),
  z.object({ state: z.literal('expired') }),
])

export type OpenedOrderLink = z.infer<typeof openedOrderLinkSchema>

const token = z.object({ body: z.strictObject({ token: orderLinkTokenSchema }) })

export const orderLinksContract = {
  open: publicRoute
    .route({
      method: 'POST',
      path: '/public/order-links/open',
      summary:
        'The order an order link opens, by the token in the body: its lines, status, QR code and pick-up information; for an expired link only that it expired; an unknown or ended link is not found; no sign-in',
    })
    .input(token)
    .output(openedOrderLinkSchema),
  renew: publicRoute
    .route({
      method: 'POST',
      path: '/public/order-links/renew',
      successStatus: 204,
      summary:
        "Send a fresh order link to the order's email for an expired link, at most once an hour for an order; answers alike for any token; no sign-in",
    })
    .input(token),
}

/**
 * What "Buy more" would add to (B1, B3): the ticket of the QR code the order carries, and what
 * the orders on that code hold, an order of the same checkout still awaiting payment among them.
 */
export const boughtSchema = z.object({
  /** The ticket type of the ticket on the code, or null for merchandise alone. */
  ticketTypeId: z.uuid().nullable(),
  /** The add-ons already bought: one is taken once. */
  addOnIds: z.array(z.uuid()),
  /** The merchandise items already ordered, which may be ordered again. */
  itemIds: z.array(z.uuid()),
})

export type Bought = z.infer<typeof boughtSchema>

/** An order of the signed-in account in a convention, as the convention's page lists it (U1-U3). */
export const myOrderSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  status: z.enum(ORDER_STATUSES),
  placedAt: timestamp,
  /** When the hold of an order awaiting payment ends: "Pay now" starts only within it. */
  holdEndsAt: timestamp.nullable(),
  /**
   * Whether "Pay now" would start a payment attempt now: the order awaits payment within its
   * hold, by the shop's own clock. The list offers it by this, never by the clock of its device.
   */
  payable: z.boolean(),
  /** The ticket holder, by whom a buyer tells their orders apart. */
  holderName: z.string(),
  edition: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }),
  lines: z.array(linkedLineSchema),
  totalMinor: z.number().int(),
  currency: z.string(),
  /** Null for an order that is not paid: nothing is added to it. */
  bought: boughtSchema.nullable(),
})

export type MyOrder = z.infer<typeof myOrderSchema>

export const myOrdersContract = {
  list: tenantRoute
    .route({
      method: 'GET',
      path: '/orders/mine',
      summary:
        "The signed-in account's own orders in the convention, the newest first; any signed-in account",
    })
    .output(z.array(myOrderSchema)),
  resendConfirmation: tenantRoute
    .route({
      method: 'POST',
      path: '/orders/mine/{orderId}/resend-confirmation',
      successStatus: 204,
      summary:
        "Send the confirmation of the account's own paid order again, with its QR code, to the order's email; refused with order.not-paid; any signed-in account",
    })
    .input(z.object({ params: z.object({ orderId: z.string() }) })),
}
