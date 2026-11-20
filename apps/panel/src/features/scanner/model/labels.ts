import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { type ScanRefusal } from '@opos/contract'

/** Why a QR code is "Not valid", as the scanner says it. */
export const REFUSAL_LABELS: Record<ScanRefusal, MessageDescriptor> = {
  unknown: msg`The edition does not know this code.`,
  'other-edition': msg`This code is of an order of another edition.`,
  replaced: msg`This code was replaced: the order has a new one, sent to its new email address.`,
  canceled: msg`The order was canceled.`,
}

/** What the org checks before letting a ticket holder in, by the age band. */
export const AGE_NOTICES: Partial<Record<string, MessageDescriptor>> = {
  child: msg`A child enters only with a guardian present.`,
  teen: msg`A teen enters only with the guardian’s consent on paper.`,
}
