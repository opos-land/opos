import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import {
  type AgeBand,
  type ManualReason,
  type OrderDetail,
  type OrderStatus,
  type ReviewCause,
} from '@opos/contract'

/** The status of an order, as a list and a page name it. */
export const STATUS_LABELS: Record<OrderStatus, MessageDescriptor> = {
  'awaiting-payment': msg({ message: 'Awaiting payment', context: 'order status' }),
  paid: msg({ message: 'Paid', context: 'order status' }),
  'paid-manual': msg({ message: 'Paid - manual', context: 'order status' }),
  expired: msg({ message: 'Expired', context: 'order status' }),
  'needs-review': msg({ message: 'Needs review', context: 'order status' }),
  declined: msg({ message: 'Declined', context: 'order status' }),
  canceled: msg({ message: 'Canceled', context: 'order status' }),
}

/** Why an org recorded an order in the panel. */
export const MANUAL_REASON_LABELS: Record<ManualReason, MessageDescriptor> = {
  desk: msg`Sale at the desk`,
  invoice: msg`Paid by invoice`,
  complimentary: msg`Complimentary`,
}

/** Why an order needs review. */
export const REVIEW_CAUSE_LABELS: Record<ReviewCause, MessageDescriptor> = {
  amount: msg`The amount paid differs from the total of the order.`,
  unavailable: msg`The payment arrived after the order had expired, and what it held was no longer available.`,
}

type EmailKind = OrderDetail['emails'][number]['kind']

/** The emails of an order, by what each tells. */
export const EMAIL_KIND_LABELS: Record<EmailKind, MessageDescriptor> = {
  'order-confirmation': msg`Confirmation with the QR code`,
  'order-expired': msg`The order expired`,
  'payment-under-review': msg`The payment is under review`,
  'needs-review': msg`Alert: the order needs review`,
  'payment-not-needed': msg`A payment the order did not need`,
  'payment-not-needed-orgs': msg`Alert: a payment to return`,
  'order-holder-changed': msg`The ticket holder was changed`,
  'order-variant-changed': msg`A variant was swapped`,
  'order-email-changed': msg`New QR code for the new email`,
  'order-email-replaced': msg`Notice to the old email`,
  'order-declined': msg`The payment was declined`,
  'order-canceled': msg`The order was canceled`,
}

type AttemptStatus = OrderDetail['attempts'][number]['status']

export const ATTEMPT_STATUS_LABELS: Record<AttemptStatus, MessageDescriptor> = {
  started: msg({ message: 'Started', context: 'payment attempt status' }),
  paid: msg({ message: 'Paid', context: 'payment attempt status' }),
  failed: msg({ message: 'Failed', context: 'payment attempt status' }),
  ended: msg({ message: 'Ended unpaid', context: 'payment attempt status' }),
  refused: msg({
    message: 'Refused: the order did not need it',
    context: 'payment attempt status',
  }),
}

/** Where the money of a payment is. */
export const MONEY_WITH_LABELS: Record<'convention' | 'buyer', MessageDescriptor> = {
  convention: msg`with the convention`,
  buyer: msg`with the buyer`,
}

/** The age band of a ticket holder. */
export const AGE_BAND_LABELS: Record<AgeBand, MessageDescriptor> = {
  child: msg`Child`,
  teen: msg`Teen`,
  adult: msg`Adult`,
}
