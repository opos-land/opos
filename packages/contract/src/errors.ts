/**
 * Every error `code` the API returns (PLAN.md 5). The client renders each one through
 * `errorMessage(code)` from @opos/i18n/errors; a code without a message there fails a test.
 */
export const errorCodes = [
  'request.invalid',
  'request.not-found',
  'request.rate-limited',
  'session.invalid',
  'session.reauthentication-required',
  'permission.denied',
  'server.error',
  'membership.last-head',
  'member.self',
  'member.head-only',
  'member.above-own',
  'member.expiry-after-own',
  'member.outlives-own',
  'member.is-head',
  'member.exists',
  'invitation.invalid',
  'invitation.expired',
  'invitation.used',
  'invitation.email-mismatch',
  'edition.slug-taken',
  'edition.active',
] as const

export type ErrorCode = (typeof errorCodes)[number]
