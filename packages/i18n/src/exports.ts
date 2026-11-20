import { msg } from '@lingui/core/macro'

// The columns of the files an org exports. The API writes a file in the language of the account
// that asked for it.

/** The production numbers of an edition's merchandise: a row a variant. */
export const productionNumbersColumns = {
  item: msg`Merchandise item`,
  variant: msg`Variant`,
  /** What the paid orders hold, manual ones among them. */
  paid: msg({ message: 'Paid', context: 'production numbers' }),
  awaitingPayment: msg({ message: 'Awaiting payment', context: 'production numbers' }),
  needsReview: msg({ message: 'Needs review', context: 'production numbers' }),
}

// The three lists of an edition's sales (docs/specs/0010-sales-reports.md, E2-E4). Each message
// carries the context of the exports, so a file says a word as its own column needs it.

/** The ticket holder list: a row an order with a ticket; the edition's custom fields come between. */
export const ticketHolderColumns = {
  number: msg({ message: 'Order number', context: 'export column' }),
  status: msg({ message: 'Status', context: 'export column' }),
  holder: msg({ message: 'Ticket holder', context: 'export column' }),
  ageBand: msg({ message: 'Age band', context: 'export column' }),
  ticketType: msg({ message: 'Ticket type', context: 'export column' }),
  addOns: msg({ message: 'Add-ons', context: 'export column' }),
  email: msg({ message: 'Email', context: 'export column' }),
  placed: msg({ message: 'Placed', context: 'export column' }),
}

/** The merchandise pick list: a row a merchandise line of a paid order. */
export const pickListColumns = {
  number: msg({ message: 'Order number', context: 'export column' }),
  name: msg({ message: 'Name', context: 'export column' }),
  item: msg({ message: 'Merchandise item', context: 'export column' }),
  variant: msg({ message: 'Variant', context: 'export column' }),
  quantity: msg({ message: 'Quantity', context: 'export column' }),
  handedOut: msg({ message: 'Handed out', context: 'export column' }),
}

/** The payments list: a row a payment attempt. */
export const paymentColumns = {
  number: msg({ message: 'Order number', context: 'export column' }),
  provider: msg({ message: 'Provider', context: 'export column' }),
  attempt: msg({ message: 'Attempt', context: 'export column' }),
  amount: msg({ message: 'Amount', context: 'export column' }),
  paidAmount: msg({ message: 'Paid amount', context: 'export column' }),
  currency: msg({ message: 'Currency', context: 'export column' }),
  paid: msg({ message: 'Paid', context: 'export column' }),
  money: msg({ message: 'Money', context: 'export column' }),
  transaction: msg({ message: 'Transaction number', context: 'export column' }),
  batch: msg({ message: 'Payout batch', context: 'export column' }),
  commission: msg({ message: 'Commission', context: 'export column' }),
  other: msg({ message: 'Other details', context: 'export column' }),
}

/** What a cell of a file says: a status, an age band, an attempt, where the money is. */
export const exportNames = {
  orderStatus: {
    'awaiting-payment': msg({ message: 'Awaiting payment', context: 'export value' }),
    paid: msg({ message: 'Paid', context: 'export value' }),
    'paid-manual': msg({ message: 'Paid - manual', context: 'export value' }),
    expired: msg({ message: 'Expired', context: 'export value' }),
    'needs-review': msg({ message: 'Needs review', context: 'export value' }),
    declined: msg({ message: 'Declined', context: 'export value' }),
    canceled: msg({ message: 'Canceled', context: 'export value' }),
  },
  ageBand: {
    child: msg({ message: 'Child', context: 'export value' }),
    teen: msg({ message: 'Teen', context: 'export value' }),
    adult: msg({ message: 'Adult', context: 'export value' }),
  },
  attemptStatus: {
    started: msg({ message: 'Started', context: 'export value: a payment attempt' }),
    paid: msg({ message: 'Paid', context: 'export value: a payment attempt' }),
    failed: msg({ message: 'Failed', context: 'export value: a payment attempt' }),
    ended: msg({ message: 'Ended', context: 'export value: a payment attempt' }),
    refused: msg({ message: 'Refused', context: 'export value: a payment attempt' }),
  },
  moneyWith: {
    convention: msg({ message: 'With the convention', context: 'export value' }),
    buyer: msg({ message: 'With the buyer', context: 'export value' }),
  },
}
