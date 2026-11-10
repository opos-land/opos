import { msg } from '@lingui/core/macro'
import { type InvitationOutcome } from '@opos/contract'
import { memberName } from './member'

/**
 * What a sent invitation says (PRODUCT.md 5.3): who joined at once, or the address and the end of
 * the link; `format` gives the end in the tenant's time zone.
 */
export function invitationNotice(outcome: InvitationOutcome, format: (iso: string) => string) {
  if (outcome.outcome === 'added') {
    const name = memberName(outcome.member)
    return msg`Added to the team: ${name}. They have been told by email.`
  }
  const email = outcome.email
  const validUntil = format(outcome.validUntil)
  return msg`An invitation has gone to ${email}. Its link works once, until ${validUntil}.`
}
