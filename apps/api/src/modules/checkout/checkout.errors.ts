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
