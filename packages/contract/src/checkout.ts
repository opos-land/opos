import { z } from 'zod'
import { ADD_ON_KINDS, AGE_BANDS, MAX_CUSTOM_FIELD_ANSWER, MAX_CUSTOM_FIELDS } from './catalog'
import { publicRoute, tenantRoute, timestamp } from './common'
import { ageBandsSchema, DOCUMENT_KINDS, MAX_EDITION_CONSENTS } from './edition-shop'
import { PAYMENT_PROVIDERS, SHOP_CURRENCY } from './shop'

// The shop of an edition as a buyer meets it (docs/specs/0004-checkout-and-orders.md): its offer,
// a cart and what the cart costs. The portal prices a cart with the function the API prices it
// with, so the total a buyer sees and the total an order is placed at are one number.

/** A sentence a provider's module gives, in each language it has it in, by locale. */
const sentence = z.record(z.string(), z.string())

/**
 * Where a ticket type of the offer stands: on sale and selectable; outside its sale window and
 * shown as not yet on sale or as closed; or with no capacity left.
 */
export const TICKET_TYPE_STATES = ['on-sale', 'not-yet', 'closed', 'sold-out'] as const

export type TicketTypeState = (typeof TICKET_TYPE_STATES)[number]

const image = z.object({
  fileId: z.uuid(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

/**
 * The offer of an edition's shop, for anyone. It never says how much stock or capacity is left:
 * of a ticket type only that it is sold out, of a variant the most one order may take of it, and
 * of an add-on the places left once they are below its threshold.
 */
export const offerSchema = z.object({
  /** Whether the edition's shop is open. A closed one offers nothing. */
  open: z.boolean(),
  /** Whether anything can be bought now; where not, the message stands in place of products. */
  onSale: z.boolean(),
  salesClosedMessage: z.string().nullable(),
  currency: z.literal(SHOP_CURRENCY),
  ageBands: ageBandsSchema.nullable(),
  guardianConsentFormUrl: z.string().nullable(),
  /** Set while the edition has a pre-order deadline: the merch step says so. */
  merchPreorderDeadline: timestamp.nullable(),
  /** Whether an order of merchandise with no ticket can be placed now. */
  merchOnly: z.boolean(),
  faqUrl: z.string().nullable(),
  /** The seller's details, which the shop's footer shows. */
  seller: z
    .object({
      name: z.string(),
      address: z.string(),
      registrationNumber: z.string(),
      contactEmail: z.string(),
    })
    .nullable(),
  /** The convention's payment provider, as far as the shop's pages name it. */
  provider: z
    .object({
      name: z.enum(PAYMENT_PROVIDERS),
      /** The payment methods the shop names, as the provider's module lists them. */
      methods: z.array(z.string()),
      /** The provider's own consent, when its module requires one, shown as the module says. */
      consent: z
        .object({
          text: sentence,
          links: z.array(z.object({ label: sentence, url: z.string() })),
          /** Whether "Select all required" may tick it. */
          selectAllAllowed: z.boolean(),
        })
        .nullable(),
      /** The longest email its module takes. */
      maxEmailLength: z.number().int().positive(),
    })
    .nullable(),
  /** The newest version of each document of the edition the shop shows. */
  documents: z.array(
    z.object({ kind: z.enum(DOCUMENT_KINDS), title: z.string(), versionId: z.uuid() }),
  ),
  consents: z.array(
    z.object({
      id: z.uuid(),
      text: z.string(),
      isRequired: z.boolean(),
      /** The version of the document it links that a buyer accepts with it, when it links one. */
      documentVersionId: z.uuid().nullable(),
    }),
  ),
  customFields: z.array(z.object({ id: z.uuid(), label: z.string(), isRequired: z.boolean() })),
  ticketTypes: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      shortDescription: z.string(),
      longDescription: z.string(),
      state: z.enum(TICKET_TYPE_STATES),
      /** The price in force; null while the ticket type is not on sale. */
      priceMinor: z.number().int().nullable(),
      /** The supporter prices offered: those above the price in force. */
      supporterPrices: z.array(z.number().int()),
      perks: z.array(z.string()),
      ageBands: z.array(z.enum(AGE_BANDS)),
      discountsExcluded: z.boolean(),
      addOnIds: z.array(z.uuid()),
      merchandiseItemIds: z.array(z.uuid()),
    }),
  ),
  addOns: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      description: z.string(),
      amountMinor: z.number().int(),
      kind: z.enum(ADD_ON_KINDS),
      /** No place is left of a limited add-on. */
      soldOut: z.boolean(),
      /** The places left of a limited add-on, once they are below its threshold; else null. */
      placesLeft: z.number().int().nullable(),
    }),
  ),
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      description: z.string(),
      amountMinor: z.number().int(),
      perOrderLimit: z.number().int(),
      picturesIllustrative: z.boolean(),
      pictures: z.array(image),
      axes: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          values: z.array(
            z.object({ id: z.uuid(), label: z.string(), sizeChart: image.nullable() }),
          ),
        }),
      ),
      /** The variants that exist and are not hidden. */
      variants: z.array(
        z.object({
          id: z.uuid(),
          valueIds: z.array(z.uuid()),
          /** The most one order may take of it now; zero while it cannot be bought. */
          maxQuantity: z.number().int().min(0),
        }),
      ),
    }),
  ),
})

export type Offer = z.infer<typeof offerSchema>

/** The most variants a cart names, and the most of one a line takes. */
export const MAX_CART_LINES = 50
export const MAX_LINE_QUANTITY = 100

/**
 * A cart: at most one ticket, the add-ons taken with it and the variants of merchandise with
 * their quantities. A cart with no ticket is a merch-only order.
 */
export const cartSchema = z.strictObject({
  ticket: z
    .strictObject({
      ticketTypeId: z.uuid(),
      /** A supporter price the ticket type offers, chosen instead of its price. */
      supporterPriceMinor: z.number().int().positive().optional(),
    })
    .nullable(),
  addOnIds: z.array(z.uuid()).max(MAX_CART_LINES).default([]),
  items: z
    .array(
      z.strictObject({
        variantId: z.uuid(),
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
      }),
    )
    .max(MAX_CART_LINES)
    .default([]),
})

export type Cart = z.infer<typeof cartSchema>

/** A line of a priced cart, and of an order: what it sells, how many and at which price. */
export const pricedLineSchema = z.object({
  /** A discount is a line of its own: what a code took off, below zero, under the code's text. */
  kind: z.enum(['ticket', 'add_on', 'merchandise', 'discount']),
  ticketTypeId: z.uuid().optional(),
  addOnId: z.uuid().optional(),
  merchandiseItemId: z.uuid().optional(),
  variantId: z.uuid().optional(),
  name: z.string(),
  /** The labels of a variant's values, in the order of its item's axes. */
  variant: z.array(z.string()),
  quantity: z.number().int().positive(),
  unitAmountMinor: z.number().int(),
  amountMinor: z.number().int(),
})

export type PricedLine = z.infer<typeof pricedLineSchema>

/**
 * A discount code as a buyer types it at the Summary: read without regard to case, and looked up
 * by the API, which alone knows its terms. A text that is no code is refused as an unknown one.
 */
export const discountCodeEntry = z.string().trim().min(1).max(60)

/** A cart to price, with the discount code the buyer entered. */
export const quoteRequestSchema = cartSchema.extend({ discountCode: discountCodeEntry.optional() })

export type QuoteRequest = z.infer<typeof quoteRequestSchema>

/** The terms of a discount code, as pricing a cart needs them. Only the API holds them. */
export interface DiscountTerms {
  code: string
  kind: 'percent' | 'amount'
  percent: number | null
  amountMinor: number | null
  ticketTypeIds: readonly string[]
  addOnIds: readonly string[]
  itemIds: readonly string[]
}

/** What a cart costs: its lines and their total, gross, in the convention's currency. */
export const quoteSchema = z.object({
  currency: z.literal(SHOP_CURRENCY),
  lines: z.array(pricedLineSchema),
  totalMinor: z.number().int().min(0),
})

export type Quote = z.infer<typeof quoteSchema>

/**
 * Why a cart cannot be had as it stands: the shop is closed, the cart is empty,
 * merch-only orders are off, or one thing of it is not on offer, has run out or is asked for in
 * more than an order may take.
 */
export type CartProblem =
  | { kind: 'closed' }
  | { kind: 'empty' }
  | { kind: 'merch-only' }
  | { kind: 'supporter-price' }
  | { kind: 'ticket-type' | 'add-on' | 'variant'; id: string }
  /** The discount code applies to nothing in the cart, or its last use is taken. */
  | { kind: 'discount-code' }

/**
 * Prices a cart against an offer, or says what of it cannot be had. The lines come in the order
 * of the offer: the ticket, then the add-ons, then the merchandise.
 */
export function priceCart(
  offer: Offer,
  cart: Cart,
  discount?: DiscountTerms,
): { lines: PricedLine[]; totalMinor: number } | { problem: CartProblem } {
  // A closed shop sells nothing. In an open one, what ran out is named, also when it was the last
  // thing on sale: the buyer returns to its step.
  if (!offer.open) return { problem: { kind: 'closed' } }
  const lines: PricedLine[] = []

  const ticketType = cart.ticket
    ? offer.ticketTypes.find((type) => type.id === cart.ticket?.ticketTypeId)
    : undefined
  if (cart.ticket) {
    if (!ticketType || ticketType.state !== 'on-sale' || ticketType.priceMinor === null) {
      return { problem: { kind: 'ticket-type', id: cart.ticket.ticketTypeId } }
    }
    const chosen = cart.ticket.supporterPriceMinor
    if (chosen !== undefined && !ticketType.supporterPrices.includes(chosen)) {
      return { problem: { kind: 'supporter-price' } }
    }
    const unitAmountMinor = chosen ?? ticketType.priceMinor
    lines.push({
      kind: 'ticket',
      ticketTypeId: ticketType.id,
      name: ticketType.name,
      variant: [],
      quantity: 1,
      unitAmountMinor,
      amountMinor: unitAmountMinor,
    })
  } else if (cart.addOnIds.length > 0) {
    // An add-on is taken with a ticket.
    return { problem: { kind: 'add-on', id: cart.addOnIds[0]! } }
  } else if (cart.items.length === 0) {
    return { problem: { kind: 'empty' } }
  } else if (!offer.merchOnly) {
    return { problem: { kind: 'merch-only' } }
  }

  const wanted = new Set<string>()
  for (const addOnId of cart.addOnIds) {
    const addOn = offer.addOns.find((offered) => offered.id === addOnId)
    if (wanted.has(addOnId) || !addOn || addOn.soldOut || !ticketType?.addOnIds.includes(addOnId)) {
      return { problem: { kind: 'add-on', id: addOnId } }
    }
    wanted.add(addOnId)
  }
  for (const addOn of offer.addOns) {
    if (!wanted.has(addOn.id)) continue
    lines.push({
      kind: 'add_on',
      addOnId: addOn.id,
      name: addOn.name,
      variant: [],
      quantity: 1,
      unitAmountMinor: addOn.amountMinor,
      amountMinor: addOn.amountMinor,
    })
  }

  // A merch-only order is offered every item of the offer; a ticket, the items it offers.
  const offered = offer.items.filter(
    (item) => !ticketType || ticketType.merchandiseItemIds.includes(item.id),
  )
  const quantities = new Map<string, number>()
  const taken = new Map<string, number>()
  for (const { variantId, quantity } of cart.items) {
    const item = offered.find((held) => held.variants.some((variant) => variant.id === variantId))
    const variant = item?.variants.find((held) => held.id === variantId)
    const ofItem = (item ? (taken.get(item.id) ?? 0) : 0) + quantity
    if (
      !item ||
      !variant ||
      quantities.has(variantId) ||
      quantity > variant.maxQuantity ||
      ofItem > item.perOrderLimit
    ) {
      return { problem: { kind: 'variant', id: variantId } }
    }
    quantities.set(variantId, quantity)
    taken.set(item.id, ofItem)
  }
  for (const item of offered) {
    for (const variant of item.variants) {
      const quantity = quantities.get(variant.id)
      if (quantity === undefined) continue
      const labels = item.axes.flatMap(
        (axis) => axis.values.find((value) => variant.valueIds.includes(value.id))?.label ?? [],
      )
      lines.push({
        kind: 'merchandise',
        merchandiseItemId: item.id,
        variantId: variant.id,
        name: item.name,
        variant: labels,
        quantity,
        unitAmountMinor: item.amountMinor,
        amountMinor: item.amountMinor * quantity,
      })
    }
  }

  if (discount) {
    const off = discountOf(offer, lines, discount)
    if (off === null) return { problem: { kind: 'discount-code' } }
    lines.push({
      kind: 'discount',
      name: discount.code,
      variant: [],
      quantity: 1,
      unitAmountMinor: -off,
      amountMinor: -off,
    })
  }
  return { lines, totalMinor: lines.reduce((total, line) => total + line.amountMinor, 0) }
}

/**
 * What a discount code takes off priced lines, or null where it applies to none of them. It
 * lowers the lines it applies to together: a percent code by that percent of their sum, rounded
 * to the grosz, half up; an amount code by its amount, at most their sum. A ticket type excluded
 * from discounts is never lowered, whatever the code names.
 */
export function discountOf(
  offer: Offer,
  lines: readonly PricedLine[],
  discount: DiscountTerms,
): number | null {
  const lowered = lines.filter((line) => {
    if (line.kind === 'ticket') {
      const type = offer.ticketTypes.find((offered) => offered.id === line.ticketTypeId)
      return (
        type !== undefined && !type.discountsExcluded && discount.ticketTypeIds.includes(type.id)
      )
    }
    if (line.kind === 'add_on') return discount.addOnIds.includes(line.addOnId ?? '')
    if (line.kind === 'merchandise') return discount.itemIds.includes(line.merchandiseItemId ?? '')
    return false
  })
  if (lowered.length === 0) return null
  const sum = lowered.reduce((total, line) => total + line.amountMinor, 0)
  return discount.kind === 'percent'
    ? Math.floor((sum * (discount.percent ?? 0) + 50) / 100)
    : Math.min(discount.amountMinor ?? 0, sum)
}

/** How long an unpaid order holds its stock and capacity, and how long a price outlasts its tier. */
export const HOLD_MINUTES = 30
export const PRICE_GRACE_MINUTES = 30

/** The most orders awaiting payment one email holds in an edition. */
export const MAX_UNPAID_ORDERS = 3

/** How long the token of a placed order opens its result page. */
export const RESULT_TOKEN_HOURS = 24

/** The header a result token travels in: never a path or a query of the API. */
export const RESULT_TOKEN_HEADER = 'x-result-token'

/**
 * What the portal sends as its bot check while its own check is not built: the API passes it on
 * `local` and `dev` alone, and nothing on production.
 */
export const BOT_CHECK_STAND_IN = 'stand-in-bot-check-passed'

/** The characters of an order's number: none that is mistaken for another. */
export const ORDER_NUMBER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const ORDER_NUMBER_LENGTH = 10

/**
 * What placing an order takes beside its buyer's address: the cart, the ticket holder's data, the
 * consents accepted, the total the buyer saw and the token of the bot check. An order with no
 * ticket has no age band and answers no custom field; its `holderName` is the buyer's own.
 */
const placeOrderFields = {
  cart: cartSchema,
  holderName: z.string().trim().min(1).max(200),
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
  /** The consents of the edition the buyer accepted. */
  consentIds: z.array(z.uuid()).max(MAX_EDITION_CONSENTS).default([]),
  /** The discount code the buyer entered at the Summary. */
  discountCode: discountCodeEntry.optional(),
  /** The provider's own consent, where its module requires one and there is something to pay. */
  providerConsentAccepted: z.boolean().default(false),
  /** A teen's buyer acknowledges that the guardian's consent is brought on paper. */
  guardianConsentAcknowledged: z.boolean().default(false),
  /** The total the buyer saw: an order is never placed at another. */
  expectedTotalMinor: z.number().int().min(0),
  botCheckToken: z.string().min(1).max(4000),
}

/** An order placed by an account: under the account's own email, which no body names. */
export const placeOrderSchema = z.strictObject(placeOrderFields)

export type PlaceOrder = z.infer<typeof placeOrderSchema>

/** An order placed by a visitor: under an email typed twice. */
export const placeVisitorOrderSchema = z
  .strictObject({
    ...placeOrderFields,
    email: z.email().max(254),
    emailConfirmation: z.string(),
  })
  .refine((order) => order.email.toLowerCase() === order.emailConfirmation.trim().toLowerCase(), {
    path: ['emailConfirmation'],
    message: 'Emails do not match',
  })

export type PlaceVisitorOrder = z.infer<typeof placeVisitorOrderSchema>

/**
 * A placed order: its number, where it stands, and the token that opens its result page for a
 * day. One with nothing to pay is paid at once.
 */
export const placedOrderSchema = z.object({
  orderId: z.uuid(),
  number: z.string(),
  status: z.enum(['awaiting-payment', 'paid']),
  totalMinor: z.number().int().min(0),
  resultToken: z.string(),
})

export type PlacedOrder = z.infer<typeof placedOrderSchema>

/** The routes of a signed-in account in a convention, with no membership needed, as a like has none. */
/** The statuses of an order (docs/specs/0004-checkout-and-orders.md, Order statuses). */
export const ORDER_STATUSES = [
  'awaiting-payment',
  'paid',
  'paid-manual',
  'expired',
  'needs-review',
  'declined',
  'canceled',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

/**
 * Why a payment attempt failed, as a buyer reads it: the shop's own short list. A provider's
 * module maps its own codes to them; the provider's code and message are for the orgs alone.
 */
export const FAILURE_REASONS = [
  'declined',
  'insufficient-funds',
  'wrong-code',
  'timed-out',
  'canceled',
  'failed',
] as const

export type FailureReason = (typeof FAILURE_REASONS)[number]

/** The result token of an order: it travels in a header, never in a path or a query. */
export const resultTokenHeaders = z.object({ [RESULT_TOKEN_HEADER]: z.string().min(1).max(200) })

/**
 * The headers of a route that starts a payment attempt: the result token, and the language of the
 * buyer's interface, which the provider's own pages follow.
 */
export const attemptHeaders = resultTokenHeaders.extend({
  'accept-language': z.string().max(200).optional(),
})

/**
 * What the result page shows of an order: its status and number alone, no personal data, and
 * what the page needs to offer another try or a new checkout.
 */
export const orderResultSchema = z.object({
  number: z.string(),
  status: z.enum(ORDER_STATUSES),
  /** When the hold of an order awaiting payment ends: a payment attempt starts only within it. */
  holdEndsAt: timestamp.nullable(),
  /** Why the last attempt failed, when its provider reported it and the order still awaits. */
  failureReason: z.enum(FAILURE_REASONS).nullable(),
  /** For an order that needs review: where the money is, as the provider's module words it. */
  moneyWith: sentence.nullable(),
  /** The edition of the order, for the way back to its shop. */
  editionSlug: z.string(),
})

export type OrderResult = z.infer<typeof orderResultSchema>

/** A payment attempt just started: where to send the buyer. */
export const startedAttemptSchema = z.object({ redirectUrl: z.url() })

export type StartedAttempt = z.infer<typeof startedAttemptSchema>

export const checkoutContract = {
  placeOrder: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/shop/orders',
      successStatus: 201,
      summary:
        "Place the account's order in the edition's shop, under the account's email; refused as the public route refuses; any signed-in account",
    })
    .input(z.object({ params: z.object({ editionId: z.string() }), body: placeOrderSchema }))
    .output(placedOrderSchema),
  startPaymentAttempt: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/orders/{orderId}/payment-attempts',
      successStatus: 201,
      summary:
        "Start a payment attempt for the account's own order and answer where to send the buyer; refused with order.hold-ended, order.already-paid or provider.unavailable; any signed-in account",
    })
    .input(
      z.object({
        params: z.object({ editionId: z.string(), orderId: z.string() }),
        // The result token, when the tab has it: the address the buyer returns to carries it.
        headers: attemptHeaders.partial(),
      }),
    )
    .output(startedAttemptSchema),
}

/**
 * What a payment provider tells the API of an attempt. The body is the provider's own; its
 * module reads it, and one whose signature does not hold answers as an unknown address.
 */
const notification = z.object({
  params: z.object({ provider: z.string(), attemptId: z.string() }),
  body: z.unknown(),
})

export const paymentsContract = {
  notification: publicRoute
    .route({
      method: 'POST',
      path: '/payments/{provider}/notifications/{attemptId}',
      summary:
        "Take a provider's notification of a payment made; answered with provider.unavailable when the provider's process could not be finished, for the provider to repeat it; no sign-in",
    })
    .input(notification)
    .output(z.object({})),
  additionalNotification: publicRoute
    .route({
      method: 'POST',
      path: '/payments/{provider}/notifications/{attemptId}/additional',
      summary:
        'Take what else a provider reports of an attempt: a failure and its reason; no sign-in',
    })
    .input(notification)
    .output(z.object({})),
}
