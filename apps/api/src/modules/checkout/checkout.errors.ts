import { type CartProblem, MAX_ORDER_TOTAL_MINOR } from '@opos/contract'
import { ApiError } from '../../common/errors/api-error'

/** The edition's shop is closed, or nothing of it is on sale. */
export const shopClosed = () => new ApiError(409, 'shop.closed', 'The shop is not selling')

/**
 * Something of a cart cannot be had: it is not on offer, it ran out, or more of it is asked for
 * than an order may take. The params name what, so the buyer returns to its step.
 */
export const orderUnavailable = (
  problem: Exclude<CartProblem, { kind: 'closed' | 'total-too-high' }>,
) =>
  new ApiError(409, 'order.unavailable', 'Something of the order cannot be had', {
    kind: problem.kind,
    ...('id' in problem && { id: problem.id }),
  })

/**
 * Everything of the cart can be had, and its lines come to more than an order keeps of an
 * amount: nothing is priced or placed, and the buyer orders less at once.
 */
export const totalTooHigh = () =>
  new ApiError(409, 'order.total-too-high', 'The order comes to more than an order may', {
    limitMinor: MAX_ORDER_TOTAL_MINOR,
  })

/** Whether an order was refused for its discount code, which cannot be used. */
export const refusedForDiscountCode = (error: unknown) =>
  error instanceof ApiError &&
  error.code === 'order.unavailable' &&
  error.params?.kind === 'discount-code'

/** The refusal a cart's problem stands for. */
export const cartRefusal = (problem: CartProblem) => {
  if (problem.kind === 'closed') return shopClosed()
  if (problem.kind === 'total-too-high') return totalTooHigh()
  return orderUnavailable(problem)
}

/** A field of an order that does not fit what the shop displays. */
export const invalidOrder = (field: string, message: string) =>
  new ApiError(400, 'request.invalid', message, { field })

/** The total differs from the one the buyer saw: nothing is placed, and the new one is told. */
export const totalChanged = (totalMinor: number) =>
  new ApiError(409, 'order.total-changed', 'The total of the order changed', { totalMinor })

/**
 * A consent the order needs was not accepted: one of the edition's, by its identifier, the
 * provider's own, or a teen's guardian's on paper.
 */
export const consentMissing = (consent: string) =>
  new ApiError(422, 'order.consent-missing', 'A required consent is missing', { consent })

/**
 * A consent was accepted as the shop no longer shows it: with another version of the document it
 * links than the newest, or with none where it links one. Nothing is placed, and the params name
 * the consent, which the buyer reads and accepts again.
 */
export const consentChanged = (consent: string) =>
  new ApiError(
    409,
    'order.consent-changed',
    'The document of a consent changed since it was shown',
    { consent },
  )

/** The provider's module cannot take the buyer's email. */
export const emailRefused = () =>
  new ApiError(422, 'order.email-refused', 'The payment provider cannot take the email')

/**
 * The buyer holds the most orders awaiting payment one may in the edition: an account its own,
 * a visitor those under the email that are on no account.
 */
export const tooManyUnpaid = (limit: number) =>
  new ApiError(409, 'order.too-many-unpaid', 'Too many orders await payment', { limit })

export const botCheckFailed = () => new ApiError(403, 'bot-check.failed', 'The bot check failed')

/** A payment attempt starts only within the hold of its order. */
export const holdEnded = () =>
  new ApiError(409, 'order.hold-ended', 'The hold of the order has ended')

/** The order does not await a payment any more: it was paid, or a payment for it is being settled. */
export const alreadyPaid = () =>
  new ApiError(409, 'order.already-paid', 'The order does not await a payment')

/**
 * A discount code that cannot be used for the order: unknown, outside its window, ended, used up
 * or applying to nothing in the cart. One answer for all, so trying codes tells nothing of them.
 */
export const discountCodeRefused = () =>
  new ApiError(409, 'discount-code.refused', 'The discount code cannot be used for this order')

/** Whether a quote was refused for its discount code, which cannot be used. */
export const quoteRefusedForDiscountCode = (error: unknown) =>
  error instanceof ApiError && error.code === 'discount-code.refused'

/** "Buy more" adds to the account's own paid order of the same edition, and to no other. */
export const notExtendable = () =>
  new ApiError(409, 'order.not-extendable', 'Nothing can be added to this order')

/**
 * An order an org moved to another address has passed to another person: the account it stays
 * on has nothing of it sent.
 */
export const passedOn = () =>
  new ApiError(409, 'order.passed-on', 'The order was moved to another email address')
