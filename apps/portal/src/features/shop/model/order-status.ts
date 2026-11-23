import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { type OrderStatus } from '@opos/contract'

/** The status of an order as its buyer reads it. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, MessageDescriptor> = {
  'awaiting-payment': msg({ message: 'Awaiting payment', context: 'the status of an order' }),
  paid: msg({ message: 'Paid', context: 'the status of an order' }),
  'paid-manual': msg({ message: 'Paid', context: 'the status of an order' }),
  expired: msg({ message: 'Expired', context: 'the status of an order' }),
  'needs-review': msg({ message: 'Payment under review', context: 'the status of an order' }),
  declined: msg({ message: 'Payment declined', context: 'the status of an order' }),
  canceled: msg({ message: 'Canceled', context: 'the status of an order' }),
}
