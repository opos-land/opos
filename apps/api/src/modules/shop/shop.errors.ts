import { ApiError } from '../../common/errors/api-error'

/** A change that an open shop of the convention forbids: the shop is closed first. */
export const shopOpen = () => new ApiError(409, 'shop.open', 'A shop of the convention is open')

/** The provider refused the credentials it was given: nothing of them is stored. */
export const credentialsRefused = () =>
  new ApiError(422, 'provider.credentials-refused', 'The provider refused the credentials')

/** The provider did not answer: nothing is stored, and the org tries again. */
export const providerUnavailable = (reason: string) =>
  new ApiError(
    503,
    'provider.unavailable',
    'The payment provider is unavailable',
    undefined,
    { 'Retry-After': '30' },
    { expected: true, reason },
  )
