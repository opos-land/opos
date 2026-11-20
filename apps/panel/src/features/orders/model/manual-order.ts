import {
  type AddOn,
  type AgeBand,
  type ManualReason,
  type MerchandiseItem,
  priceAt,
  type TicketType,
} from '@opos/contract'

/** A sale made outside the shop, as its screen holds it while an org records it. */
export interface ManualOrderDraft {
  reason: ManualReason
  note: string
  /** Empty for a sale of merchandise alone. */
  ticketTypeId: string
  addOnIds: string[]
  /** How many of each variant, by the variant's identifier. */
  quantities: Record<string, number>
  holderName: string
  ageBand: AgeBand | ''
  /** What was answered to each custom field, by the field's identifier. */
  answers: Record<string, string>
}

export const EMPTY_MANUAL_ORDER: ManualOrderDraft = {
  reason: 'desk',
  note: '',
  ticketTypeId: '',
  addOnIds: [],
  quantities: {},
  holderName: '',
  ageBand: '',
  answers: {},
}

/** What an edition sells, as the catalog's own routes list it. */
export interface Catalog {
  ticketTypes: readonly TicketType[]
  addOns: readonly AddOn[]
  items: readonly MerchandiseItem[]
}

/** The values of a variant, in the order of its item's axes. */
const labelOf = (item: MerchandiseItem, valueIds: readonly string[]) =>
  item.axes
    .flatMap((axis) => axis.values.find((value) => valueIds.includes(value.id))?.label ?? [])
    .join(', ')

/** The price of a ticket type at a moment, or null where it is not on sale then. */
const priceOf = (type: TicketType, at: Date) => {
  const moment = at.getTime()
  const inWindow = Date.parse(type.saleStartsAt) <= moment && moment < Date.parse(type.saleEndsAt)
  return inWindow ? priceAt(type.tiers, at) : null
}

/**
 * What the screen offers at a moment: the ticket types with a price in force, and, for the one
 * chosen, its add-ons and its items; without a ticket, every item. The API prices and counts
 * again when the order is recorded.
 */
export function offeredTo(catalog: Catalog, ticketTypeId: string, at: Date) {
  const ticketTypes = catalog.ticketTypes.flatMap((type) => {
    const priceMinor = type.hidden ? null : priceOf(type, at)
    return priceMinor === null ? [] : [{ ...type, priceMinor }]
  })
  const ticketType = ticketTypes.find((type) => type.id === ticketTypeId) ?? null
  return {
    ticketTypes,
    ticketType,
    addOns: catalog.addOns.filter(
      (addOn) => !addOn.hidden && ticketType?.addOnIds.includes(addOn.id),
    ),
    items: catalog.items
      .filter(
        (item) => !item.hidden && (!ticketType || ticketType.merchandiseItemIds.includes(item.id)),
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        amountMinor: item.amountMinor,
        variants: item.variants
          .filter((variant) => !variant.hidden)
          .map((variant) => ({ id: variant.id, label: labelOf(item, variant.valueIds) })),
      })),
  }
}

/** The lines of a draft at the prices in force, and their total; nothing for a complimentary one. */
export function manualOrderLines(catalog: Catalog, draft: ManualOrderDraft, at: Date) {
  const offer = offeredTo(catalog, draft.ticketTypeId, at)
  const free = draft.reason === 'complimentary'
  const priced = [
    ...(offer.ticketType
      ? [{ name: offer.ticketType.name, quantity: 1, unitMinor: offer.ticketType.priceMinor }]
      : []),
    ...offer.addOns
      .filter((addOn) => draft.addOnIds.includes(addOn.id))
      .map((addOn) => ({ name: addOn.name, quantity: 1, unitMinor: addOn.amountMinor })),
    ...offer.items.flatMap((item) =>
      item.variants.flatMap((variant) => {
        const quantity = draft.quantities[variant.id] ?? 0
        if (quantity <= 0) return []
        const name = variant.label ? `${item.name} (${variant.label})` : item.name
        return [{ name, quantity, unitMinor: item.amountMinor }]
      }),
    ),
  ]
  const lines = priced.map(({ unitMinor, ...line }) => ({
    ...line,
    amountMinor: free ? 0 : unitMinor * line.quantity,
  }))
  return { lines, totalMinor: lines.reduce((total, line) => total + line.amountMinor, 0) }
}

/** The draft as the API takes it. Without a ticket there is no ticket holder to describe. */
export function manualOrderBody(draft: ManualOrderDraft) {
  const withTicket = draft.ticketTypeId !== ''
  return {
    reason: draft.reason,
    note: draft.note.trim() || null,
    cart: {
      ticket: withTicket ? { ticketTypeId: draft.ticketTypeId } : null,
      addOnIds: withTicket ? draft.addOnIds : [],
      items: Object.entries(draft.quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([variantId, quantity]) => ({ variantId, quantity })),
    },
    holderName: draft.holderName.trim(),
    ageBand: withTicket && draft.ageBand !== '' ? draft.ageBand : null,
    customFieldAnswers: withTicket
      ? Object.entries(draft.answers)
          .map(([fieldId, answer]) => ({ fieldId, answer: answer.trim() }))
          .filter(({ answer }) => answer !== '')
      : [],
  }
}
