import { z } from 'zod'
import { ORDER_STATUSES } from './checkout'
import { publicRoute, timestamp } from './common'

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
