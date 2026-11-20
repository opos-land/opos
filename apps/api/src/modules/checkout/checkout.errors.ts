import { type CartProblem } from '@opos/contract'
import { ApiError } from '../../common/errors/api-error'

/** The edition's shop is closed, or nothing of it is on sale. */
export const shopClosed = () => new ApiError(409, 'shop.closed', 'The shop is not selling')

/**
 * Something of a cart cannot be had: it is not on offer, it ran out, or more of it is asked for
 * than an order may take. The params name what, so the buyer returns to its step.
 */
export const orderUnavailable = (problem: Exclude<CartProblem, { kind: 'closed' }>) =>
  new ApiError(409, 'order.unavailable', 'Something of the order cannot be had', {
    kind: problem.kind,
    ...('id' in problem && { id: problem.id }),
  })

/** The refusal a cart's problem stands for. */
export const cartRefusal = (problem: CartProblem) =>
  problem.kind === 'closed' ? shopClosed() : orderUnavailable(problem)

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

/** The provider's module cannot take the buyer's email. */
export const emailRefused = () =>
  new ApiError(422, 'order.email-refused', 'The payment provider cannot take the email')

/** The email holds the most orders awaiting payment it may in the edition. */
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

/** "Buy more" adds to the account's own paid order of the same edition, and to no other. */
export const notExtendable = () =>
  new ApiError(409, 'order.not-extendable', 'Nothing can be added to this order')
