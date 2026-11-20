import { msg } from '@lingui/core/macro'

// One rendering per glossary term (PRODUCT.md 3). The pl catalog holds the Polish rendering that
// every other message reuses. The `glossary` context keeps a term apart from the same English
// word used elsewhere, e.g. the verb "like".
export const glossary = {
  tenant: msg({ message: 'convention', context: 'glossary', comment: 'Glossary term: tenant' }),
  edition: msg({ message: 'edition', context: 'glossary', comment: 'Glossary term: edition' }),
  programItem: msg({
    message: 'programme item',
    context: 'glossary',
    comment: 'Glossary term: programme item',
  }),
  speaker: msg({ message: 'speaker', context: 'glossary', comment: 'Glossary term: speaker' }),
  like: msg({ message: 'like', context: 'glossary', comment: 'Glossary term: like (noun)' }),
  review: msg({ message: 'review', context: 'glossary', comment: 'Glossary term: review' }),
  ticketType: msg({
    message: 'ticket type',
    context: 'glossary',
    comment: 'Glossary term: ticket type',
  }),
  order: msg({ message: 'order', context: 'glossary', comment: 'Glossary term: order' }),
  ticket: msg({ message: 'ticket', context: 'glossary', comment: 'Glossary term: ticket' }),
  scanner: msg({ message: 'scanner', context: 'glossary', comment: 'Glossary term: scanner' }),
  attendee: msg({ message: 'attendee', context: 'glossary', comment: 'Glossary term: attendee' }),
  admin: msg({ message: 'administrator', context: 'glossary', comment: 'Glossary term: admin' }),
  org: msg({ message: 'organizer', context: 'glossary', comment: 'Glossary term: org' }),
  head: msg({ message: 'head organizer', context: 'glossary', comment: 'Glossary term: head' }),
  user: msg({ message: 'user', context: 'glossary', comment: 'Glossary term: user' }),
  core: msg({ message: 'core', context: 'glossary', comment: 'Glossary term: core' }),
  module: msg({ message: 'module', context: 'glossary', comment: 'Glossary term: module' }),
  booth: msg({ message: 'booth', context: 'glossary', comment: 'Glossary term: booth' }),
  mfa: msg({
    message: 'two-factor authentication',
    context: 'glossary',
    comment: 'Glossary term: two-factor authentication',
  }),
  locale: msg({ message: 'language', context: 'glossary', comment: 'Glossary term: locale' }),
  suspended: msg({
    message: 'suspended',
    context: 'glossary',
    comment: 'Glossary term: suspended (a convention the admin took off the platform)',
  }),
  venue: msg({
    message: 'venue',
    context: 'glossary',
    comment: 'Glossary term: venue (where an edition takes place)',
  }),
  shop: msg({
    message: 'shop',
    context: 'glossary',
    comment: 'Glossary term: shop (where an edition sells)',
  }),
  consent: msg({
    message: 'consent',
    context: 'glossary',
    comment: 'Glossary term: consent (a sentence a buyer accepts with an order)',
  }),
  priceTier: msg({
    message: 'price tier',
    context: 'glossary',
    comment: 'Glossary term: price tier (a price of a ticket type within a date window)',
  }),
  supporterPrice: msg({
    message: 'supporter price',
    context: 'glossary',
    comment: 'Glossary term: supporter price (a higher price a buyer may choose)',
  }),
  perk: msg({
    message: 'perk',
    context: 'glossary',
    comment: 'Glossary term: perk (something a ticket type includes, never sold separately)',
  }),
  addOn: msg({
    message: 'add-on',
    context: 'glossary',
    comment: 'Glossary term: add-on (an optional extra bought with a ticket)',
  }),
  merchandiseItem: msg({
    message: 'merchandise item',
    context: 'glossary',
    comment: 'Glossary term: merchandise item (a product picked up at the edition)',
  }),
  variant: msg({
    message: 'variant',
    context: 'glossary',
    comment: 'Glossary term: variant (a buyable option of a merchandise item, with its own stock)',
  }),
  sizeChart: msg({
    message: 'size chart',
    context: 'glossary',
    comment: 'Glossary term: size chart',
  }),
  preorderDeadline: msg({
    message: 'pre-order deadline',
    context: 'glossary',
    comment: 'Glossary term: pre-order deadline (until it merchandise sells without a stock limit)',
  }),
  ageBand: msg({
    message: 'age band',
    context: 'glossary',
    comment: 'Glossary term: age band (child, teen or adult)',
  }),
  guardianConsent: msg({
    message: 'guardian consent',
    context: 'glossary',
    comment: "Glossary term: guardian consent (a guardian's written consent for a teen)",
  }),
  customField: msg({
    message: 'custom field',
    context: 'glossary',
    comment: 'Glossary term: custom field (a short text an edition asks a ticket holder for)',
  }),
  ticketHolder: msg({
    message: 'ticket holder',
    context: 'glossary',
    comment: 'Glossary term: ticket holder (the person a ticket is issued to)',
  }),
  buyer: msg({
    message: 'buyer',
    context: 'glossary',
    comment: 'Glossary term: buyer (who places an order and pays for it)',
  }),
  payment: msg({
    message: 'payment',
    context: 'glossary',
    comment: 'Glossary term: payment (money a payment provider reports for an order)',
  }),
  paymentAttempt: msg({
    message: 'payment attempt',
    context: 'glossary',
    comment: 'Glossary term: payment attempt (one try at paying an order at its provider)',
  }),
  hold: msg({
    message: 'hold',
    context: 'glossary',
    comment: 'Glossary term: hold (what an unpaid order keeps of stock and capacity for a time)',
  }),
  qrCode: msg({
    message: 'QR code',
    context: 'glossary',
    comment: 'Glossary term: QR code (what a paid order is found by at the edition)',
  }),
  orderLink: msg({
    message: 'order link',
    context: 'glossary',
    comment: 'Glossary term: order link (an emailed link that opens one order without a sign-in)',
  }),
  manualOrder: msg({
    message: 'manual order',
    context: 'glossary',
    comment: 'Glossary term: manual order (a sale made outside the shop, recorded by an org)',
  }),
  discountCode: msg({
    message: 'discount code',
    context: 'glossary',
    comment: 'Glossary term: discount code (a code a buyer enters to lower the price of an order)',
  }),
}

export type GlossaryTerm = keyof typeof glossary
