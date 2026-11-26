import { ApiError } from '../../common/errors/api-error'

/** A list of the catalog holds the most it can: nothing is added to it. */
export const limitReached = (limit: number) =>
  new ApiError(409, 'catalog.limit-reached', 'The list holds the most it can', { limit })

/** A field whose value does not fit the rest of what is stored, which no schema of a change sees. */
export const invalidField = (field: string, message: string) =>
  new ApiError(400, 'request.invalid', message, { field })

/** Two price tiers of a ticket type cover a moment together: it has one price at a time. */
export const tiersOverlap = () =>
  new ApiError(422, 'ticket-type.tiers-overlap', 'Two price tiers overlap')

/** A list of variants built on a reading of the item that someone changed the variants of since. */
export const variantsChanged = () =>
  new ApiError(
    409,
    'catalog.variants-changed',
    'The variants of the item are not the ones the list was built on',
  )

/** A capacity or a stock set below what orders hold of it; `held` is how much they hold. */
export const belowHeld = (held: number) =>
  new ApiError(409, 'catalog.below-held', 'Orders hold more than the limit', { held })
