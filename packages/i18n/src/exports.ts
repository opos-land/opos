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
