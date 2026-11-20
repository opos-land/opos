import { ApiError } from '../../common/errors/api-error'

/**
 * A correction is made on a "Paid" or a "Paid - manual" order, and a manual order has no email to
 * change (docs/specs/0006-order-management.md, C6).
 */
export const notCorrectable = () =>
  new ApiError(409, 'order.not-correctable', 'The order cannot be corrected as it stands')

/** An org cancels a "Paid" or a "Paid - manual" order, and no other (X1). */
export const notCancelable = () =>
  new ApiError(409, 'order.not-cancelable', 'Only a paid order is canceled')

/** An org settles an order in "Needs review", and no other (R2, R4). */
export const notInReview = () =>
  new ApiError(409, 'order.not-in-review', 'The order does not need review')

/** Only a paid order has a confirmation to resend, and something to hand out (S1, H1). */
export const notPaid = () => new ApiError(409, 'order.not-paid', 'The order is not paid')

/** The line was handed out already, by a scanner or on the order's page. */
export const alreadyHandedOut = (lineId: string, handedOutAt: Date) =>
  new ApiError(409, 'scan.already-handed-out', 'The line was already handed out', {
    lineId,
    handedOutAt: handedOutAt.toISOString(),
  })
