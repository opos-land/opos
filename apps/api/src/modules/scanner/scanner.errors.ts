import { type ScanRefusal } from '@opos/contract'
import { ApiError } from '../../common/errors/api-error'

/** An edition has the most scanners enabled at a time it may (D10). */
export const scannerLimitReached = (limit: number) =>
  new ApiError(409, 'scanner.limit-reached', 'The edition has its limit of scanners', { limit })

/** Another scanner of the edition that still stands has the name (D8). */
export const scannerNameTaken = () =>
  new ApiError(409, 'scanner.name-taken', 'Another scanner of the edition has the name')

/** A scanner's access ends no later than that of the org who enables it (D3). */
export const scannerOutlivesOrg = () =>
  new ApiError(422, 'scanner.outlives-org', 'The scanner would outlive the access of its org')

/** A scanner that was revoked or has ended is paired with no phone again (D14). */
export const scannerEnded = () =>
  new ApiError(409, 'scanner.ended', 'The scanner was revoked or has ended')

/** A pairing code that is unknown, used or expired, or of a scanner that no longer stands. */
export const pairingCodeRefused = () =>
  new ApiError(403, 'scanner.code-refused', 'The pairing code is refused')

/**
 * The caller is no scanner that stands, and nothing it holds will make it one: no token, an
 * unknown one, or one of a device that was revoked, has ended, was given a new pairing code, or
 * whose org left the team. One answer for all, which tells nothing of a token.
 */
export const scannerRevoked = () =>
  new ApiError(401, 'scanner.revoked', 'The scanner has no access')

/**
 * The scanner and the token it was asked by stand, and the org who enabled it is in the team
 * but cannot write the tickets of its edition at this moment: their access has ended or their
 * permission was lowered. The same token works again once the org can, so the phone keeps it.
 */
export const scannerStopped = () =>
  new ApiError(403, 'scanner.stopped', 'The org who enabled the scanner has no access now')

/** The QR code opens nothing here: "Not valid", with the reason (S3). */
export const scanNotValid = (reason: ScanRefusal) =>
  new ApiError(409, 'scan.not-valid', 'The QR code is not valid', { reason })
