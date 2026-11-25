import {
  MAX_DOCUMENT_VERSIONS,
  MAX_EDITION_CONSENTS,
  MAX_EDITION_DOCUMENTS,
  type ShopCondition,
} from '@opos/contract'
import { ApiError } from '../../common/errors/api-error'

/** A change that an open shop of the convention forbids: the shop is closed first. */
export const shopOpen = () => new ApiError(409, 'shop.open', 'A shop of the convention is open')

/**
 * An order of the convention awaits payment: a payment under way is confirmed with the account
 * it started with, which is not disconnected until it is paid or expires, and gives way to new
 * credentials only where the payment loses nothing by it.
 */
export const paymentsUnderWay = () =>
  new ApiError(409, 'shop.payments-under-way', 'An order of the convention awaits payment')

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

/** Opening is refused while a condition is missing: the params name each one that is. */
export const shopNotReady = (missing: readonly ShopCondition[]) =>
  new ApiError(
    409,
    'shop.not-ready',
    'The shop cannot be opened yet',
    Object.fromEntries(missing.map((condition) => [condition, 'missing'])),
  )

/** A document a consent links stays until the consent lets go of it. */
export const documentInUse = () =>
  new ApiError(409, 'document.in-use', 'A consent links the document')

export const tooManyDocuments = () =>
  new ApiError(409, 'document.too-many', 'The edition holds the most documents it can', {
    limit: MAX_EDITION_DOCUMENTS,
  })

export const tooManyVersions = () =>
  new ApiError(409, 'document.too-many-versions', 'The document holds the most versions it can', {
    limit: MAX_DOCUMENT_VERSIONS,
  })

export const tooManyConsents = () =>
  new ApiError(409, 'consent.too-many', 'The edition holds the most consents it can', {
    limit: MAX_EDITION_CONSENTS,
  })
