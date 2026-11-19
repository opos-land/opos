import { z } from 'zod'
import { ADD_ON_KINDS, AGE_BANDS } from './catalog'
import { timestamp } from './common'
import { ageBandsSchema, DOCUMENT_KINDS } from './edition-shop'
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
  kind: z.enum(['ticket', 'add_on', 'merchandise']),
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

/**
 * Prices a cart against an offer, or says what of it cannot be had. The lines come in the order
 * of the offer: the ticket, then the add-ons, then the merchandise.
 */
export function priceCart(
  offer: Offer,
  cart: Cart,
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

  return { lines, totalMinor: lines.reduce((total, line) => total + line.amountMinor, 0) }
}
