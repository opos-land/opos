import { ApiError } from '../../common/errors/api-error'

/**
 * A correction is made on a "Paid" or a "Paid - manual" order, and a manual order has no email to
 * change (docs/specs/0006-order-management.md, C6).
 */
export const notCorrectable = () =>
  new ApiError(409, 'order.not-correctable', 'The order cannot be corrected as it stands')
