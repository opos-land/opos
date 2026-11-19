import {
  type AddOn,
  type MerchandiseItem,
  type Offer,
  offeredSupporterPrices,
  priceAt,
  type TicketType,
} from '@opos/contract'

type OfferedTicketType = Offer['ticketTypes'][number]

/**
 * A ticket type as the shop offers it at a moment, or undefined where the shop does not show it:
 * hidden, or outside its sale window with nothing saying to show it there. It is on sale inside
 * its window while a price tier covers the moment; a sale window holds its start and not its end.
 */
export function offeredTicketType(
  type: TicketType,
  at: Date,
  held: number,
): OfferedTicketType | undefined {
  if (type.hidden) return undefined
  const moment = at.getTime()
  const inWindow = Date.parse(type.saleStartsAt) <= moment && moment < Date.parse(type.saleEndsAt)
  const price = inWindow ? priceAt(type.tiers, at) : null
  const shown = {
    id: type.id,
    name: type.name,
    shortDescription: type.shortDescription,
    longDescription: type.longDescription,
    perks: type.perks,
    ageBands: type.ageBands,
    discountsExcluded: type.discountsExcluded,
    addOnIds: type.addOnIds,
    merchandiseItemIds: type.merchandiseItemIds,
  }
  if (price !== null) {
    const soldOut = type.capacity !== null && held >= type.capacity
    return {
      ...shown,
      state: soldOut ? 'sold-out' : 'on-sale',
      priceMinor: price,
      supporterPrices: offeredSupporterPrices(type.supporterPrices, price),
    }
  }
  if (!type.shownOutsideSaleWindow) return undefined
  // Not on sale yet while its window or a later tier is still to come; closed once neither is.
  const later =
    moment < Date.parse(type.saleStartsAt) ||
    (inWindow && type.tiers.some((tier) => Date.parse(tier.startsAt) > moment))
  return { ...shown, state: later ? 'not-yet' : 'closed', priceMinor: null, supporterPrices: [] }
}

/** An add-on as the shop offers it: whether a place is left, and how many below its threshold. */
export function offeredAddOn(addOn: AddOn, held: number): Offer['addOns'][number] {
  const left = addOn.capacity === null ? null : Math.max(addOn.capacity - held, 0)
  return {
    id: addOn.id,
    name: addOn.name,
    description: addOn.description,
    amountMinor: addOn.amountMinor,
    kind: addOn.kind,
    soldOut: left === 0,
    placesLeft:
      left !== null && addOn.placesLeftThreshold !== null && left < addOn.placesLeftThreshold
        ? left
        : null,
  }
}

/**
 * An item as the shop offers it at a moment: the variants that are not hidden, each with the most
 * one order may take of it. A variant with a stock sells what orders have not taken of it; an
 * unlimited one sells until the edition's pre-order deadline, and nothing where there is none.
 */
export function offeredItem(
  item: MerchandiseItem,
  at: Date,
  preorderDeadline: Date | null,
  held: ReadonlyMap<string, number>,
): Offer['items'][number] {
  const preorder = preorderDeadline !== null && at.getTime() < preorderDeadline.getTime()
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    amountMinor: item.amountMinor,
    perOrderLimit: item.perOrderLimit,
    picturesIllustrative: item.picturesIllustrative,
    pictures: item.pictures.map(({ fileId, width, height }) => ({ fileId, width, height })),
    axes: item.axes,
    variants: item.variants
      .filter((variant) => !variant.hidden)
      .map((variant) => {
        const left =
          variant.stock === null
            ? preorder
              ? item.perOrderLimit
              : 0
            : Math.max(variant.stock - (held.get(variant.id) ?? 0), 0)
        return {
          id: variant.id,
          valueIds: variant.valueIds,
          maxQuantity: Math.min(item.perOrderLimit, left),
        }
      }),
  }
}
