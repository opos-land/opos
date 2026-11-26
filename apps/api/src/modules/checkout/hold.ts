import { type OrderStatus } from '@opos/contract'

/**
 * Whether the order is within its hold at `at`: it awaits payment, and its hold has not ended.
 * A payment attempt starts only then (docs/specs/0004-checkout-and-orders.md, Y2), and the pages
 * that offer one are told so by this, the shop's own clock.
 */
export const withinHold = (
  order: { status: OrderStatus; holdEndsAt: Date | null },
  at: Date,
): boolean =>
  order.status === 'awaiting-payment' &&
  order.holdEndsAt !== null &&
  order.holdEndsAt.getTime() > at.getTime()
