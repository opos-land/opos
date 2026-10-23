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
  locale: msg({ message: 'language', context: 'glossary', comment: 'Glossary term: locale' }),
}

export type GlossaryTerm = keyof typeof glossary
