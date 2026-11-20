import { z } from 'zod'
import { AGE_BANDS, MAX_CUSTOM_FIELD_ANSWER, MAX_CUSTOM_FIELDS } from './catalog'
import { cartSchema, FAILURE_REASONS, ORDER_STATUSES } from './checkout'
import { tenantRoute, timestamp } from './common'
import { PAYMENT_PROVIDERS } from './shop'

// What an org does with an edition's orders in the panel
// (docs/specs/0006-order-management.md). Reading needs tickets read access to the edition,
// every change write access.

/** Why an org recorded an order in the panel. */
export const MANUAL_REASONS = ['desk', 'invoice', 'complimentary'] as const

export type ManualReason = (typeof MANUAL_REASONS)[number]

/** Why an order needs review. */
export const REVIEW_CAUSES = ['amount', 'unavailable'] as const

export type ReviewCause = (typeof REVIEW_CAUSES)[number]

/** The most orders one page of the list holds. */
export const MAX_ORDER_PAGE = 100

/** The emails an order sends, by their cause. */
export const ORDER_EMAIL_KINDS = [
  'order-confirmation',
  'order-expired',
  'payment-under-review',
  'needs-review',
  'payment-not-needed',
  'payment-not-needed-orgs',
  'order-holder-changed',
  'order-variant-changed',
  'order-email-changed',
  'order-email-replaced',
  'order-declined',
  'order-canceled',
  'order-link',
  'pre-edition-reminder',
] as const

/** The emails that go to the orgs who settle an order, not to its buyer. */
export const ORG_EMAIL_KINDS: readonly (typeof ORDER_EMAIL_KINDS)[number][] = [
  'needs-review',
  'payment-not-needed-orgs',
]

/**
 * The emails that hand an order over: with its QR code, with an order link, or with both. What
 * is kept of one leaves those out.
 */
export const HANDING_OVER_EMAIL_KINDS: readonly (typeof ORDER_EMAIL_KINDS)[number][] = [
  'order-confirmation',
  'order-email-changed',
  'order-link',
  'pre-edition-reminder',
]

/** What stands, in the kept text of an email, where it had what only its recipient sees. */
export const LEFT_OUT = '[…]'

/** The most emails one page of the list holds. */
export const MAX_EMAIL_PAGE = 100

export const PAYMENT_ATTEMPT_STATUSES = ['started', 'paid', 'failed', 'ended', 'refused'] as const

/** A QR code's text, as the panel tells one from a name or a number typed into the search. */
export const QR_CODE_PATTERN = /^[A-Z2-7]{32}$/

/**
 * What an org searches and filters an edition's orders by: a part of a number, a name or an
 * email; the QR code an order carries; a status; what the order holds; and when it was placed.
 * A QR code is searched by its SHA-256 hash, which the panel makes: the code itself never
 * travels in an address, where a log would keep it.
 */
export const orderListQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(200).optional(),
  qrCodeHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  ticketTypeId: z.uuid().optional(),
  addOnId: z.uuid().optional(),
  itemId: z.uuid().optional(),
  variantId: z.uuid().optional(),
  from: timestamp.optional(),
  to: timestamp.optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_ORDER_PAGE).default(MAX_ORDER_PAGE),
})

export type OrderListQuery = z.infer<typeof orderListQuerySchema>

/** An order as the list shows it. */
export const orderSummarySchema = z.object({
  id: z.uuid(),
  number: z.string(),
  status: z.enum(ORDER_STATUSES),
  /** Empty for a manual order, which nobody placed in the shop. */
  email: z.string().nullable(),
  holderName: z.string(),
  totalMinor: z.number().int(),
  placedAt: timestamp,
  manualReason: z.enum(MANUAL_REASONS).nullable(),
  /** The name of the ticket type it holds a ticket of; null for merchandise alone. */
  ticketType: z.string().nullable(),
})

export type OrderSummary = z.infer<typeof orderSummarySchema>

/**
 * A page of an edition's orders, those needing review first and then the newest, with how many
 * the search found and how many of the edition need review, whatever the search.
 */
export const orderListSchema = z.object({
  orders: z.array(orderSummarySchema),
  total: z.number().int().min(0),
  needsReview: z.number().int().min(0),
})

export type OrderList = z.infer<typeof orderListSchema>

/** An email of an order, as its order's page lists it. */
const emailSchema = z.object({
  id: z.uuid(),
  kind: z.enum(ORDER_EMAIL_KINDS),
  /** Null for an alert to the orgs: their addresses stay behind the team's own permission. */
  recipient: z.string().nullable(),
  queuedAt: timestamp,
  sentAt: timestamp.nullable(),
  /** Set for an email not sent because the order left its address before it went out. */
  withdrawnAt: timestamp.nullable(),
  failedAttempts: z.number().int(),
})

/**
 * What an org searches an edition's emails by: a part of the address one went to or of the
 * number of its order.
 */
export const orderEmailListQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_EMAIL_PAGE).default(MAX_EMAIL_PAGE),
})

export type OrderEmailListQuery = z.infer<typeof orderEmailListQuerySchema>

/** An email as the list of an edition's emails shows it: with the order it is of. */
export const orderEmailSummarySchema = emailSchema.extend({
  order: z.object({ id: z.uuid(), number: z.string() }),
})

export type OrderEmailSummary = z.infer<typeof orderEmailSummarySchema>

/** A page of the emails of an edition's orders, the newest first, with how many the search found. */
export const orderEmailListSchema = z.object({
  emails: z.array(orderEmailSummarySchema),
  total: z.number().int().min(0),
})

export type OrderEmailList = z.infer<typeof orderEmailListSchema>

/**
 * An email with what it said: its subject and its text as they went out, in the language they
 * went out in, with `LEFT_OUT` where the QR code and the token of the order link were. Both are
 * null for an email not sent, and for one sent before texts were kept.
 */
export const orderEmailDetailSchema = orderEmailSummarySchema.extend({
  subject: z.string().nullable(),
  body: z.string().nullable(),
})

export type OrderEmailDetail = z.infer<typeof orderEmailDetailSchema>

const lineSchema = z.object({
  id: z.uuid(),
  /** A discount is a line of its own, with an amount below zero. */
  kind: z.enum(['ticket', 'add_on', 'merchandise', 'discount']),
  /** What the line sells, by its name in the catalog; empty for a discount. */
  name: z.string(),
  /** The labels of a variant's values, in the order of its item's axes. */
  variant: z.array(z.string()),
  /** For a merchandise line: its item and its variant, which a swap changes. */
  merchandiseItemId: z.uuid().nullable(),
  variantId: z.uuid().nullable(),
  quantity: z.number().int(),
  unitAmountMinor: z.number().int(),
  amountMinor: z.number().int(),
  handedOutAt: timestamp.nullable(),
})

const attemptSchema = z.object({
  id: z.uuid(),
  provider: z.enum(PAYMENT_PROVIDERS),
  status: z.enum(PAYMENT_ATTEMPT_STATUSES),
  amountMinor: z.number().int(),
  paidAmountMinor: z.number().int().nullable(),
  startedAt: timestamp,
  paidAt: timestamp.nullable(),
  confirmedAt: timestamp.nullable(),
  moneyWith: z.enum(['convention', 'buyer']).nullable(),
  failureReason: z.enum(FAILURE_REASONS).nullable(),
  /** The provider's own code and words of a failure, for the orgs alone. */
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  /** What the provider's module keeps of the payment, such as the transaction's number. */
  information: z.record(z.string(), z.string()),
})

/** An order as its page shows it: everything the order keeps. */
export const orderDetailSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  status: z.enum(ORDER_STATUSES),
  email: z.string().nullable(),
  holderName: z.string(),
  ageBand: z.enum(AGE_BANDS).nullable(),
  guardianConsentAcknowledgedAt: timestamp.nullable(),
  totalMinor: z.number().int(),
  /** What the payments the convention holds add up to: beside the total, it tells a difference. */
  paidMinor: z.number().int(),
  currency: z.string(),
  holds: z.boolean(),
  placedAt: timestamp,
  paidAt: timestamp.nullable(),
  manualReason: z.enum(MANUAL_REASONS).nullable(),
  note: z.string().nullable(),
  reviewCause: z.enum(REVIEW_CAUSES).nullable(),
  canceledAt: timestamp.nullable(),
  cancelReason: z.string().nullable(),
  declinedAt: timestamp.nullable(),
  declineReason: z.string().nullable(),
  /** The discount code the order used, as the org wrote it; its discount line says what it took off. */
  discountCode: z.string().nullable(),
  /** Whether the order carries a QR code; the code itself is shown to its buyer alone. */
  hasQrCode: z.boolean(),
  lines: z.array(lineSchema),
  answers: z.array(z.object({ fieldId: z.uuid(), label: z.string(), answer: z.string() })),
  consents: z.array(
    z.object({
      consentId: z.uuid(),
      text: z.string(),
      acceptedAt: timestamp,
      /** The version of the document accepted with it, when the consent linked one. */
      document: z
        .object({ title: z.string(), versionId: z.uuid(), number: z.number().int() })
        .nullable(),
    }),
  ),
  attempts: z.array(attemptSchema),
  emails: z.array(emailSchema),
})

export type OrderDetail = z.infer<typeof orderDetailSchema>
export type OrderLine = z.infer<typeof lineSchema>
export type OrderAttempt = z.infer<typeof attemptSchema>

/** A correction of the ticket holder's name: only an edit, nothing else changes with it. */
export const updateOrderHolderSchema = z.strictObject({
  holderName: z.string().trim().min(1).max(200),
})

export type UpdateOrderHolder = z.infer<typeof updateOrderHolderSchema>

/**
 * A new email of an order: the order gets a new QR code and a new order link, and the old ones
 * stop working. It is the only way a ticket passes to another person.
 */
export const changeOrderEmailSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
})

export type ChangeOrderEmail = z.infer<typeof changeOrderEmailSchema>

/** Another variant of the same item for a merchandise line. */
export const swapVariantSchema = z.strictObject({ variantId: z.uuid() })

export type SwapVariant = z.infer<typeof swapVariantSchema>

/**
 * A sale made outside the shop, recorded by an org: at a desk, by invoice, or complimentary. It
 * holds what the shop's cart holds and is priced as the shop prices it at that moment, a
 * complimentary one at zero. It asks for no email, stores no consent, and requires neither a
 * name nor an answer; with a ticket it takes the ticket holder's age band.
 */
export const manualOrderSchema = z.strictObject({
  reason: z.enum(MANUAL_REASONS),
  note: z
    .string()
    .trim()
    .max(500)
    .transform((note) => note || null)
    .nullable()
    .default(null),
  cart: cartSchema,
  holderName: z.string().trim().max(200).default(''),
  ageBand: z.enum(AGE_BANDS).nullable(),
  customFieldAnswers: z
    .array(
      z.strictObject({
        fieldId: z.uuid(),
        answer: z.string().trim().min(1).max(MAX_CUSTOM_FIELD_ANSWER),
      }),
    )
    .max(MAX_CUSTOM_FIELDS)
    .default([]),
})

export type ManualOrder = z.infer<typeof manualOrderSchema>

/** The most lines one hand-out names: more than any order holds. */
export const MAX_HAND_OUT_LINES = 200

/**
 * The lines of an order an org marks as handed out on its page, for a buyer whose QR code
 * cannot be read: entry is the ticket's line, items the merchandise lines.
 */
export const handOutSchema = z.strictObject({
  lineIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_HAND_OUT_LINES)
    .refine((ids) => new Set(ids).size === ids.length, 'A line is named once'),
})

export type HandOut = z.infer<typeof handOutSchema>

/**
 * The production numbers of an edition's merchandise, to send to the manufacturer once the
 * pre-order deadline has passed: for every variant of every item, what the paid orders hold of
 * it, manual ones among them, and apart from that what the orders awaiting payment and those
 * needing review hold.
 */
export const productionNumbersSchema = z.object({
  /** The pre-order deadline that has passed; null for an edition that set none. */
  deadline: timestamp.nullable(),
  items: z.array(
    z.object({
      itemId: z.uuid(),
      name: z.string(),
      variants: z.array(
        z.object({
          variantId: z.uuid(),
          /** The labels of the variant's values, in the order of its item's axes. */
          labels: z.array(z.string()),
          paid: z.number().int().min(0),
          awaitingPayment: z.number().int().min(0),
          needsReview: z.number().int().min(0),
        }),
      ),
    }),
  ),
})

export type ProductionNumbers = z.infer<typeof productionNumbersSchema>

const reason = z.string().trim().min(1).max(500)

/**
 * A cancellation of a paid order, with its reason. It is only a cancellation: OPOS returns no
 * money, which is the convention's matter.
 */
export const cancelOrderSchema = z.strictObject({ reason })

export type CancelOrder = z.infer<typeof cancelOrderSchema>

/** A decline of an order that needs review, with its reason. */
export const declineOrderSchema = z.strictObject({ reason })

export type DeclineOrder = z.infer<typeof declineOrderSchema>

const edition = z.object({ params: z.object({ editionId: z.string() }) })
const order = z.object({ params: z.object({ editionId: z.string(), orderId: z.string() }) })
const line = z.object({
  params: z.object({ editionId: z.string(), orderId: z.string(), lineId: z.string() }),
})
const email = z.object({ params: z.object({ editionId: z.string(), emailId: z.string() }) })

export const ordersContract = {
  list: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/orders',
      summary:
        "A page of the edition's orders, those needing review first: searched by number, name, email or the hash of a QR code, filtered by status, product, variant and date; needs tickets>=read",
    })
    .input(edition.extend({ query: orderListQuerySchema }))
    .output(orderListSchema),
  get: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/orders/{orderId}',
      summary:
        'An order with its lines, the data of its ticket holder, its payment attempts and its emails; needs tickets>=read',
    })
    .input(order)
    .output(orderDetailSchema),
  emails: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/order-emails',
      summary:
        "A page of the emails of the edition's orders, the newest first: searched by the address one went to or by its order's number; needs tickets>=read",
    })
    .input(edition.extend({ query: orderEmailListQuerySchema }))
    .output(orderEmailListSchema),
  email: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/order-emails/{emailId}',
      summary:
        'An email of an order with what it said: its subject and its text as they went out, without the QR code and the order link; needs tickets>=read',
    })
    .input(email)
    .output(orderEmailDetailSchema),
  createManual: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/orders/manual',
      successStatus: 201,
      summary:
        'Records a sale made outside the shop as a "Paid - manual" order with its lines handed out; refused with order.unavailable naming what ran out; needs tickets=write',
    })
    .input(edition.extend({ body: manualOrderSchema }))
    .output(orderDetailSchema),
  updateHolder: tenantRoute
    .route({
      method: 'PATCH',
      path: '/editions/{editionId}/orders/{orderId}/holder',
      summary:
        "Corrects the ticket holder's name of a paid order and tells the buyer; needs tickets=write",
    })
    .input(order.extend({ body: updateOrderHolderSchema }))
    .output(orderDetailSchema),
  changeEmail: tenantRoute
    .route({
      method: 'PUT',
      path: '/editions/{editionId}/orders/{orderId}/email',
      summary:
        'Moves a paid order to another email: a new QR code and order link, the old ones stop working, both addresses are told; needs tickets=write',
    })
    .input(order.extend({ body: changeOrderEmailSchema }))
    .output(orderDetailSchema),
  swapVariant: tenantRoute
    .route({
      method: 'PUT',
      path: '/editions/{editionId}/orders/{orderId}/lines/{lineId}/variant',
      summary:
        "Swaps a merchandise line's variant for another of the same item, while that one has stock; needs tickets=write",
    })
    .input(line.extend({ body: swapVariantSchema }))
    .output(orderDetailSchema),
  cancel: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/orders/{orderId}/cancel',
      summary:
        'Cancels a paid order with a reason: what it held returns, and the buyer of a shop order is told. No money is returned; needs tickets=write',
    })
    .input(order.extend({ body: cancelOrderSchema }))
    .output(orderDetailSchema),
  markPaid: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/orders/{orderId}/mark-paid',
      summary:
        'Marks an order that needs review paid; one that holds nothing takes again what it held, and is refused with order.unavailable naming what is gone; needs tickets=write',
    })
    .input(order)
    .output(orderDetailSchema),
  decline: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/orders/{orderId}/decline',
      summary:
        'Declines an order that needs review with a reason: it holds nothing, gets no QR code, and its buyer is told; needs tickets=write',
    })
    .input(order.extend({ body: declineOrderSchema }))
    .output(orderDetailSchema),
  resendConfirmation: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/orders/{orderId}/resend-confirmation',
      summary:
        "Sends a paid order's confirmation again to its email, with the same QR code and a fresh order link; needs tickets=write",
    })
    .input(order)
    .output(orderDetailSchema),
  handOut: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/orders/{orderId}/hand-outs',
      summary:
        'Marks lines of a paid order as handed out, with the time; refused with scan.already-handed-out for a line that was; needs tickets=write',
    })
    .input(order.extend({ body: handOutSchema }))
    .output(orderDetailSchema),
  takeBackHandOut: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/orders/{orderId}/lines/{lineId}/hand-out',
      summary: "Takes a line's hand-out mark back, whoever made it; needs tickets=write",
    })
    .input(line)
    .output(orderDetailSchema),
  productionNumbers: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/production-numbers',
      summary:
        "The count of every variant of the edition's merchandise, once the pre-order deadline has passed; needs tickets>=read",
    })
    .input(edition)
    .output(productionNumbersSchema),
  productionNumbersExport: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/production-numbers/export',
      outputStructure: 'detailed',
      summary:
        'The production numbers as a CSV file, its columns in the language asked for in Accept-Language, which the panel sends as the one it shows; needs tickets>=read',
    })
    .input(
      edition.extend({
        headers: z.object({ 'accept-language': z.string().max(200).optional() }),
      }),
    )
    .output(z.object({ headers: z.record(z.string(), z.string()), body: z.instanceof(Blob) })),
}
