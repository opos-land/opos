import { type MyOrder, type Offer, placeVisitorOrderSchema } from '@opos/contract'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  beginCheckout,
  cartOf,
  clearDraft,
  clearDrafts,
  type Draft,
  emptyDraft,
  extensionDraft,
  fitToOffer,
  forgetDraftsAtSignOut,
  holderIssues,
  loadDraft,
  offeredAddOns,
  offeredItems,
  orderBody,
  quoteOf,
  resumeExtension,
  saveDraft,
  stepsOf,
  summaryIssues,
  withTicketType,
} from './checkout'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [standard, supporter, workshop, room, pin, shirt, small, medium, sizeS, sizeM] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
].map(id)
const [city, fandom, terms, news, termsV1, termsV2] = [11, 12, 13, 14, 15, 16].map(id)

/** A consent as a checkout keeps it once accepted: with the version of its document shown then. */
const accepted = (consentId: string, documentVersionId: string | null = null) => ({
  consentId,
  documentVersionId,
})
const [termsAccepted, newsAccepted] = [accepted(terms!, termsV1), accepted(news!)]

const offer = (changes: Partial<Offer> = {}): Offer => ({
  open: true,
  onSale: true,
  salesClosedMessage: null,
  currency: 'PLN',
  ageBands: { teenFromAge: 13, adultFromAge: 18 },
  guardianConsentFormUrl: null,
  merchPreorderDeadline: null,
  merchOnly: true,
  faqUrl: null,
  seller: null,
  provider: {
    name: 'fake',
    methods: ['blik'],
    consent: { text: { en: 'Provider terms' }, links: [], selectAllAllowed: false },
    maxEmailLength: 50,
  },
  documents: [],
  consents: [
    { id: terms!, text: 'Terms', isRequired: true, documentVersionId: termsV1! },
    { id: news!, text: 'News', isRequired: false, documentVersionId: null },
  ],
  customFields: [
    { id: city!, label: 'City', isRequired: true },
    { id: fandom!, label: 'Fandom', isRequired: false },
  ],
  ticketTypes: [
    {
      id: standard!,
      name: 'Standard',
      shortDescription: '',
      longDescription: '',
      state: 'on-sale',
      priceMinor: 10000,
      supporterPrices: [20000],
      perks: [],
      ageBands: ['teen', 'adult'],
      discountsExcluded: false,
      addOnIds: [workshop!, room!],
      merchandiseItemIds: [pin!, shirt!],
    },
    {
      id: supporter!,
      name: 'Supporter',
      shortDescription: '',
      longDescription: '',
      state: 'on-sale',
      priceMinor: 40000,
      supporterPrices: [],
      perks: [],
      ageBands: ['adult'],
      discountsExcluded: true,
      addOnIds: [room!],
      merchandiseItemIds: [],
    },
  ],
  addOns: [
    {
      id: workshop!,
      name: 'Workshop',
      description: '',
      amountMinor: 4000,
      kind: 'limited',
      soldOut: false,
      placesLeft: null,
      picture: null,
    },
    {
      id: room!,
      name: 'Room',
      description: '',
      amountMinor: 0,
      kind: 'headcount',
      soldOut: false,
      placesLeft: null,
      picture: null,
    },
  ],
  items: [
    {
      id: pin!,
      name: 'Pin',
      description: '',
      amountMinor: 1500,
      perOrderLimit: 10,
      picturesIllustrative: false,
      pictures: [],
      axes: [],
      variants: [{ id: small!, valueIds: [], maxQuantity: 10 }],
    },
    {
      id: shirt!,
      name: 'T-shirt',
      description: '',
      amountMinor: 8000,
      perOrderLimit: 5,
      picturesIllustrative: true,
      pictures: [],
      axes: [
        {
          id: id(20),
          name: 'Size',
          values: [
            { id: sizeS!, label: 'S', sizeChart: null },
            { id: sizeM!, label: 'M', sizeChart: null },
          ],
        },
      ],
      variants: [{ id: medium!, valueIds: [sizeM!], maxQuantity: 5 }],
    },
  ],
  ...changes,
})

const filled = (changes: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(standard!),
  holderName: 'Ada',
  ageBand: 'adult',
  email: 'ada@example.test',
  emailConfirmation: 'ada@example.test',
  answers: { [city!]: 'Poznań' },
  asVisitor: true,
  ...changes,
})

describe('the steps of a checkout', () => {
  it('are four for a ticket: ticket holder, add-ons, merch, summary', () => {
    expect(stepsOf(offer(), emptyDraft(standard!))).toEqual([
      'holder',
      'add-ons',
      'merch',
      'summary',
    ])
  })

  it('are three for an order of merchandise alone, with no add-ons', () => {
    expect(stepsOf(offer(), emptyDraft(null))).toEqual(['holder', 'merch', 'summary'])
  })

  // A step with nothing to offer is skipped and hidden.
  it('leave out a step with nothing to offer', () => {
    expect(stepsOf(offer(), emptyDraft(supporter!))).toEqual(['holder', 'add-ons', 'summary'])
    const bare = offer({ addOns: [], items: [] })
    expect(stepsOf(bare, emptyDraft(standard!))).toEqual(['holder', 'summary'])
  })

  it('offer a ticket type its own add-ons and items, and a merch-only order every item', () => {
    expect(offeredAddOns(offer(), emptyDraft(supporter!)).map((addOn) => addOn.name)).toEqual([
      'Room',
    ])
    expect(offeredItems(offer(), emptyDraft(supporter!))).toEqual([])
    expect(offeredItems(offer(), emptyDraft(null)).map((item) => item.name)).toEqual([
      'Pin',
      'T-shirt',
    ])
    expect(offeredAddOns(offer(), emptyDraft(null))).toEqual([])
  })
})

describe('the running total', () => {
  it('is priced by the function the API prices an order with', () => {
    const draft = filled({
      supporterPriceMinor: 20000,
      addOnIds: [workshop!],
      items: [{ variantId: small!, quantity: 2 }],
    })

    expect(cartOf(draft)).toEqual({
      ticket: { ticketTypeId: standard, supporterPriceMinor: 20000 },
      addOnIds: [workshop],
      items: [{ variantId: small, quantity: 2 }],
    })
    expect(quoteOf(offer(), draft)).toMatchObject({ totalMinor: 20000 + 4000 + 3000 })
  })

  it('is the ticket alone before anything is added, and nothing for an empty merch-only cart', () => {
    expect(quoteOf(offer(), emptyDraft(standard!))).toMatchObject({ totalMinor: 10000 })
    expect(quoteOf(offer(), emptyDraft(null))).toEqual({ problem: { kind: 'empty' } })
  })
})

describe('the ticket holder step', () => {
  it('passes a filled form', () => {
    expect(holderIssues(offer(), filled(), null)).toEqual({})
  })

  // Nobody has to be named: the name is the one field of the step that may stay empty.
  it('asks for the age band, the email twice and each required field, and never for the name', () => {
    expect(holderIssues(offer(), emptyDraft(standard!), null)).toEqual({
      ageBand: 'required',
      email: 'required',
      emailConfirmation: 'required',
      [`answer:${city}`]: 'required',
    })
  })

  it('refuses an email that is none, two that differ, and one the provider cannot take', () => {
    const issue = (changes: Partial<Draft>) => holderIssues(offer(), filled(changes), null)

    expect(issue({ email: 'ada', emailConfirmation: 'ada' })).toEqual({ email: 'invalid' })
    expect(issue({ emailConfirmation: 'Ada@Example.test ' })).toEqual({})
    expect(issue({ emailConfirmation: 'other@example.test' })).toEqual({
      emailConfirmation: 'mismatch',
    })
    const long = `${'a'.repeat(39)}@example.test`
    expect(issue({ email: long, emailConfirmation: long })).toEqual({ email: 'too-long' })
  })

  // An address the shop refuses is refused here, beside its field: placed with one, the order
  // would come back from the Summary as invalid, with no field named.
  it('takes an email exactly when the shop takes it for a visitor’s order', () => {
    const emails = [
      'ada@example.test',
      'ada.lovelace+shop@mail.example.test',
      'jan@gmail.com.',
      'jan.@gmail.com',
      'jan..k@gmail.com',
      'jan@gmail.c',
      'jan@gmail.com,',
      'żaneta@poczta.pl',
      'jan@poczta.żółw.pl',
    ]
    const taken = (email: string) =>
      placeVisitorOrderSchema.shape.email.safeParse(email).success ? undefined : 'invalid'

    for (const email of emails) {
      const issues = holderIssues(offer(), filled({ email, emailConfirmation: email }), null)
      expect(issues.email, email).toBe(taken(email))
    }
    expect(taken('ada@example.test')).toBeUndefined()
    expect(taken('jan@gmail.com.')).toBe('invalid')
  })

  // A signed-in buyer's email is the account's: nothing is typed and nothing is checked of it.
  it('asks no email of a signed-in buyer', () => {
    expect(
      holderIssues(offer(), filled({ email: '', emailConfirmation: '' }), 'jan@example.test'),
    ).toEqual({})
  })

  // An account email the provider's module cannot take cannot pay through it: checkout says so
  // before the order is placed.
  it('stops a signed-in buyer whose account email the provider cannot take', () => {
    const long = `${'a'.repeat(39)}@example.test`

    expect(holderIssues(offer(), filled(), long)).toEqual({ accountEmail: 'too-long' })
    expect(holderIssues(offer({ provider: null }), filled(), long)).toEqual({})
  })

  it('refuses an age band the ticket type does not allow', () => {
    expect(holderIssues(offer(), filled({ ageBand: 'child' }), null)).toEqual({
      ageBand: 'not-allowed',
    })
  })

  // A merch-only order asks for the buyer's email: never an age band or a field.
  it('asks an order of merchandise alone for the email only', () => {
    expect(holderIssues(offer(), emptyDraft(null), null)).toEqual({
      email: 'required',
      emailConfirmation: 'required',
    })
  })
})

describe('the summary', () => {
  it('needs every required consent, the provider’s own while there is something to pay, and a teen’s acknowledgement', () => {
    expect(summaryIssues(offer(), filled({ ageBand: 'teen' }), 10000)).toEqual({
      consents: [terms],
      provider: true,
      guardian: true,
    })
    expect(
      summaryIssues(
        offer(),
        filled({
          ageBand: 'teen',
          consents: [termsAccepted],
          providerConsent: true,
          guardianAcknowledged: true,
        }),
        10000,
      ),
    ).toEqual({ consents: [], provider: false, guardian: false })
  })

  it('needs no consent of the provider for an order with nothing to pay', () => {
    expect(summaryIssues(offer(), filled({ consents: [termsAccepted] }), 0)).toEqual({
      consents: [],
      provider: false,
      guardian: false,
    })
  })
})

describe('another ticket type', () => {
  // Add-ons the new ticket type does not offer are removed, with a notice; the merchandise is
  // kept or not as the buyer says.
  it('keeps what the new one offers and names the add-ons it removed', () => {
    const draft = filled({
      addOnIds: [workshop!, room!],
      items: [{ variantId: small!, quantity: 1 }],
      supporterPriceMinor: 20000,
      step: 'summary',
    })

    const kept = withTicketType(offer(), draft, supporter!, true)
    expect(kept.removedAddOns).toEqual(['Workshop'])
    expect(kept.draft).toMatchObject({
      ticketTypeId: supporter,
      supporterPriceMinor: null,
      addOnIds: [room],
      // The supporter ticket type offers no merchandise: what it does not offer goes.
      items: [],
      holderName: 'Ada',
      step: 'holder',
    })

    const same = withTicketType(offer(), draft, standard!, true)
    expect(same.removedAddOns).toEqual([])
    expect(same.draft.items).toEqual([{ variantId: small, quantity: 1 }])
    expect(withTicketType(offer(), draft, standard!, false).draft.items).toEqual([])
  })
})

describe('the age band of another ticket type', () => {
  it('is the adult one after merchandise alone, the one already chosen otherwise, and none without a ticket', () => {
    const alone = { ...emptyDraft(null), holderName: 'Ada' }

    expect(withTicketType(offer(), alone, standard!, true).draft.ageBand).toBe('adult')
    expect(
      withTicketType(offer(), filled({ ageBand: 'teen' }), supporter!, true).draft.ageBand,
    ).toBe('teen')
    expect(withTicketType(offer(), filled(), null, true).draft.ageBand).toBeNull()
  })
})

describe('the start of a checkout', () => {
  it('is empty for the ticket type asked for, with the account\u2019s name filled in and the adult age band chosen', () => {
    expect(beginCheckout(offer(), null, standard, 'Jan Kowal')).toEqual({
      draft: { ...emptyDraft(standard!), holderName: 'Jan Kowal', ageBand: 'adult' },
      removedAddOns: [],
      ask: false,
    })
    expect(beginCheckout(offer(), null, null, '').draft).toEqual(emptyDraft(null))
    // Nothing asked for and nothing kept: there is no checkout to show.
    expect(beginCheckout(offer(), null, undefined, '').draft).toBeNull()
  })

  // A reload, Back and a return from signing in resume what the tab kept.
  it('goes on with what the tab kept, a name already typed left as it is', () => {
    const kept = filled({ step: 'merch' })

    expect(beginCheckout(offer(), kept, undefined, 'Jan Kowal').draft).toEqual(kept)
    expect(beginCheckout(offer(), kept, standard, 'Jan Kowal').draft).toEqual(kept)
    expect(
      beginCheckout(offer(), filled({ holderName: '' }), standard, 'Jan Kowal').draft?.holderName,
    ).toBe('Jan Kowal')
  })

  // A buyer who went on with no name left it out: nothing fills it in behind their back.
  it('leaves a name empty once the buyer went past the first step without one', () => {
    const kept = filled({ holderName: '', step: 'summary' })

    expect(beginCheckout(offer(), kept, standard, 'Jan Kowal').draft).toEqual(kept)
  })

  // Most ticket holders are adults; a ticket type not sold to them leaves the choice open.
  it('chooses no age band for a ticket type not sold to adults', () => {
    const [first, ...rest] = offer().ticketTypes
    const young = offer({ ticketTypes: [{ ...first!, ageBands: ['child', 'teen'] }, ...rest] })

    expect(beginCheckout(young, null, standard, '').draft?.ageBand).toBeNull()
  })

  it('moves to another ticket type at once when no merchandise was chosen, naming what it removed', () => {
    const kept = filled({ addOnIds: [workshop!, room!] })

    const started = beginCheckout(offer(), kept, supporter, '')

    expect(started.ask).toBe(false)
    expect(started.removedAddOns).toEqual(['Workshop'])
    expect(started.draft).toMatchObject({ ticketTypeId: supporter, addOnIds: [room] })
  })

  it('asks whether to keep the merchandise before it moves to another ticket type', () => {
    const kept = filled({ items: [{ variantId: small!, quantity: 1 }] })

    expect(beginCheckout(offer(), kept, supporter, '')).toEqual({
      draft: kept,
      removedAddOns: [],
      ask: true,
    })
  })
})

// The tab keeps a checkout for as long as it lives, and the offer changes meanwhile: what the
// offer no longer holds is on no step, so the buyer could neither see it nor take it out.
describe('a checkout whose offer changed since it was kept', () => {
  const [first, second] = offer().ticketTypes

  it('stays as it is while the offer holds all it chose', () => {
    const draft = filled({
      supporterPriceMinor: 20000,
      addOnIds: [workshop!],
      items: [{ variantId: small!, quantity: 2 }],
      consents: [termsAccepted, newsAccepted],
      answers: { [city!]: 'Poznań', [fandom!]: 'Dune' },
    })

    const fitted = fitToOffer(offer(), draft)

    expect(fitted.dropped).toBe(false)
    expect(fitted.changedConsents).toEqual([])
    expect(fitted.draft).toBe(draft)
  })

  it('loses the add-on, the variant and the supporter price no longer offered, and says so', () => {
    const draft = filled({
      supporterPriceMinor: 20000,
      addOnIds: [workshop!, room!],
      items: [
        { variantId: small!, quantity: 2 },
        { variantId: medium!, quantity: 1 },
      ],
    })
    // The workshop is hidden, the pin is no longer sold with the ticket type, and the supporter
    // price is gone.
    const changed = offer({
      ticketTypes: [
        { ...first!, supporterPrices: [], addOnIds: [room!], merchandiseItemIds: [shirt!] },
        second!,
      ],
      addOns: offer().addOns.filter((addOn) => addOn.id !== workshop),
    })

    const fitted = fitToOffer(changed, draft)

    expect(fitted.dropped).toBe(true)
    expect(fitted.draft).toEqual({
      ...draft,
      supporterPriceMinor: null,
      addOnIds: [room],
      items: [{ variantId: medium, quantity: 1 }],
    })
    expect(quoteOf(changed, fitted.draft)).toMatchObject({ totalMinor: 10000 + 8000 })
  })

  // What ran out is still offered: its step shows it, marked, and the buyer takes it out.
  it('keeps what ran out and is still on its step', () => {
    const draft = filled({ addOnIds: [workshop!], items: [{ variantId: medium!, quantity: 1 }] })
    const [pinItem, shirtItem] = offer().items
    const ranOut = offer({
      addOns: offer().addOns.map((addOn) => ({ ...addOn, soldOut: addOn.id === workshop })),
      items: [
        pinItem!,
        { ...shirtItem!, variants: [{ ...shirtItem!.variants[0]!, maxQuantity: 0 }] },
      ],
    })

    expect(fitToOffer(ranOut, draft)).toEqual({ draft, dropped: false, changedConsents: [] })
  })

  // A consent or a custom field the edition hid is on no screen: the order must not carry it.
  it('loses a consent and an answer the edition no longer asks for, with nothing to say', () => {
    const draft = filled({
      consents: [termsAccepted, newsAccepted],
      answers: { [city!]: 'Poznań', [fandom!]: 'Dune' },
    })
    const changed = offer({
      consents: offer().consents.filter((consent) => consent.id !== news),
      customFields: offer().customFields.filter((field) => field.id !== fandom),
    })

    const fitted = fitToOffer(changed, draft)

    expect(fitted.dropped).toBe(false)
    expect(fitted.changedConsents).toEqual([])
    expect(fitted.draft).toEqual({
      ...draft,
      consents: [termsAccepted],
      answers: { [city!]: 'Poznań' },
    })
    expect(orderBody(fitted.draft, 10000, 'token', false)).toMatchObject({
      consents: [termsAccepted],
      customFieldAnswers: [{ fieldId: city, answer: 'Poznań' }],
    })
  })

  // A buyer accepts a consent as it was shown: with a new version of its document it is another
  // one, and is accepted again.
  it('loses the acceptance of a consent whose document changed since, and names the consent', () => {
    const draft = filled({ consents: [termsAccepted, newsAccepted], step: 'summary' })
    const [termsShown, newsShown] = offer().consents

    // A new version of the terms is published.
    const republished = fitToOffer(
      offer({ consents: [{ ...termsShown!, documentVersionId: termsV2! }, newsShown!] }),
      draft,
    )
    expect(republished.dropped).toBe(false)
    expect(republished.changedConsents).toEqual([terms])
    expect(republished.draft).toEqual({ ...draft, consents: [newsAccepted] })

    // A consent shown with no document gets the first version of one.
    const linked = fitToOffer(
      offer({ consents: [termsShown!, { ...newsShown!, documentVersionId: termsV2! }] }),
      draft,
    )
    expect(linked.changedConsents).toEqual([news])
    expect(linked.draft).toEqual({ ...draft, consents: [termsAccepted] })
  })

  // The listing is where another ticket type is picked, and it carries over what was chosen.
  it('keeps its add-ons and merchandise while its ticket type is gone from the offer', () => {
    const draft = filled({ addOnIds: [room!], items: [{ variantId: small!, quantity: 1 }] })

    expect(fitToOffer(offer({ ticketTypes: [second!] }), draft)).toEqual({
      draft,
      dropped: false,
      changedConsents: [],
    })
  })

  it('fits a "Buy more" checkout to what the ticket type of its order is offered', () => {
    const more: Draft = {
      ...emptyDraft(null),
      extending: {
        orderId: id(40),
        number: 'ABCDEFGHJK',
        holderName: 'Ada',
        ticketTypeId: supporter!,
        addOnIds: [],
        itemIds: [],
      },
      addOnIds: [workshop!, room!],
      items: [{ variantId: small!, quantity: 1 }],
      step: 'summary',
    }

    const fitted = fitToOffer(offer(), more)

    expect(fitted.dropped).toBe(true)
    expect(fitted.draft).toMatchObject({ addOnIds: [room], items: [] })
  })
})

describe('the order a checkout places', () => {
  it('is the cart with the ticket holder’s data and the total the buyer saw', () => {
    const draft = filled({
      holderName: ' Ada ',
      answers: { [city!]: ' Poznań ', [fandom!]: '  ' },
      consents: [termsAccepted],
      providerConsent: true,
    })

    expect(orderBody(draft, 10000, 'token', false)).toEqual({
      cart: { ticket: { ticketTypeId: standard }, addOnIds: [], items: [] },
      holderName: 'Ada',
      ageBand: 'adult',
      customFieldAnswers: [{ fieldId: city, answer: 'Poznań' }],
      // Each consent with the version of its document the buyer was shown.
      consents: [{ consentId: terms, documentVersionId: termsV1 }],
      providerConsentAccepted: true,
      guardianConsentAcknowledged: false,
      expectedTotalMinor: 10000,
      botCheckToken: 'token',
      email: 'ada@example.test',
      emailConfirmation: 'ada@example.test',
    })
  })

  it('carries no email for a signed-in buyer, and no age band or answer for merchandise alone', () => {
    const body = orderBody(
      { ...filled({ items: [{ variantId: small!, quantity: 1 }] }), ticketTypeId: null },
      1500,
      'token',
      true,
    )

    expect(body).not.toHaveProperty('email')
    expect(body).not.toHaveProperty('emailConfirmation')
    expect(body).toMatchObject({ ageBand: null, customFieldAnswers: [], cart: { ticket: null } })
  })
})

// docs/specs/0008-discount-codes.md, K1 and K2: an order takes one code, the one applied.
describe('the order a checkout places with a discount code', () => {
  it('names the code that was applied, and none otherwise', () => {
    const draft = filled({ discountCode: ' EARLY10 ' })

    expect(orderBody(draft, 9000, 'token', false, true)).toMatchObject({
      discountCode: 'EARLY10',
      expectedTotalMinor: 9000,
    })
    // Entered, and refused by the shop: the order is placed without it.
    expect(orderBody(draft, 10000, 'token', false, false)).not.toHaveProperty('discountCode')
    expect(orderBody(filled(), 10000, 'token', false, true)).not.toHaveProperty('discountCode')
  })

  it('reads a checkout kept before the shop took codes as one with no code', () => {
    const older: Partial<Draft> = filled({ step: 'summary' })
    delete older.discountCode
    window.sessionStorage.setItem('opos-checkout:convention-a:2026', JSON.stringify(older))

    expect(loadDraft('convention-a', '2026')).toMatchObject({ step: 'summary', discountCode: '' })
  })
})

// docs/specs/0009-buyer-self-service.md, B1-B3: "Buy more" on a paid order.
describe('a checkout that adds to a paid order', () => {
  const paid = (changes: Partial<MyOrder> = {}): MyOrder => ({
    id: id(40),
    number: 'ABCDEFGHJK',
    status: 'paid',
    placedAt: '2027-05-01T10:00:00.000Z',
    holdEndsAt: null,
    payable: false,
    holderName: 'Ada Lovelace',
    edition: { id: id(41), slug: '2027', name: 'Convention A 2027' },
    lines: [],
    totalMinor: 12000,
    currency: 'PLN',
    bought: { ticketTypeId: standard!, addOnIds: [room!], itemIds: [pin!] },
    ...changes,
  })
  const merchAlone = { ticketTypeId: null, addOnIds: [], itemIds: [pin!] }

  it('asks nothing of the ticket holder again: its steps are add-ons, merch and summary', () => {
    const draft = extensionDraft(offer(), paid())

    expect(stepsOf(offer(), draft)).toEqual(['add-ons', 'merch', 'summary'])
    expect(draft).toMatchObject({
      step: 'add-ons',
      ticketTypeId: null,
      holderName: 'Ada Lovelace',
      extending: { orderId: id(40), number: 'ABCDEFGHJK', addOnIds: [room], itemIds: [pin] },
    })
    // An order of merchandise alone is offered the merchandise alone.
    const alone = extensionDraft(offer(), paid({ bought: merchAlone }))
    expect(stepsOf(offer(), alone)).toEqual(['merch', 'summary'])
    expect(alone.step).toBe('merch')
  })

  it('is offered the add-ons and the merchandise of the order’s ticket type', () => {
    const ofSupporter = extensionDraft(
      offer(),
      paid({ bought: { ticketTypeId: supporter!, addOnIds: [], itemIds: [] } }),
    )

    expect(offeredAddOns(offer(), ofSupporter).map((addOn) => addOn.name)).toEqual(['Room'])
    expect(offeredItems(offer(), ofSupporter)).toEqual([])
    expect(stepsOf(offer(), ofSupporter)).toEqual(['add-ons', 'summary'])
    const alone = extensionDraft(offer({ merchOnly: false }), paid({ bought: merchAlone }))
    expect(offeredItems(offer(), alone).map((item) => item.name)).toEqual(['Pin', 'T-shirt'])
  })

  it('sells no ticket, and is priced by the function the API prices it with', () => {
    const draft = {
      ...extensionDraft(offer(), paid()),
      addOnIds: [workshop!],
      items: [{ variantId: small!, quantity: 2 }],
    }

    expect(cartOf(draft)).toMatchObject({ ticket: null, addOnIds: [workshop] })
    expect(quoteOf(offer(), draft)).toMatchObject({ totalMinor: 4000 + 2 * 1500 })
    // An add-on already bought is not taken again; nothing chosen is nothing to order.
    expect(quoteOf(offer(), { ...draft, addOnIds: [room!] })).toEqual({
      problem: { kind: 'add-on', id: room },
    })
    expect(quoteOf(offer(), extensionDraft(offer(), paid()))).toEqual({
      problem: { kind: 'empty' },
    })
  })

  it('places an order that names the one it adds to, for the same ticket holder', () => {
    const draft = {
      ...extensionDraft(offer(), paid()),
      items: [{ variantId: small!, quantity: 1 }],
      consents: [termsAccepted],
    }

    expect(orderBody(draft, 1500, 'token', true)).toEqual({
      cart: { ticket: null, addOnIds: [], items: [{ variantId: small, quantity: 1 }] },
      holderName: 'Ada Lovelace',
      ageBand: null,
      customFieldAnswers: [],
      consents: [termsAccepted],
      providerConsentAccepted: false,
      guardianConsentAcknowledged: false,
      expectedTotalMinor: 1500,
      botCheckToken: 'token',
      extendsOrderId: id(40),
    })
    expect(orderBody(filled(), 10000, 'token', true)).not.toHaveProperty('extendsOrderId')
  })

  it('is kept in the tab apart from the edition’s own checkout, and from another order’s', () => {
    window.sessionStorage.clear()
    const more = extensionDraft(offer(), paid())
    const other = extensionDraft(offer(), paid({ id: id(42) }))

    saveDraft('convention-a', '2027', more)
    saveDraft('convention-a', '2027', filled())

    expect(loadDraft('convention-a', '2027')).toMatchObject({ extending: null })
    expect(loadDraft('convention-a', '2027', id(40))).toEqual(more)
    expect(loadDraft('convention-a', '2027', other.extending!.orderId)).toBeNull()
    clearDraft('convention-a', '2027', id(40))
    expect(loadDraft('convention-a', '2027', id(40))).toBeNull()
    expect(loadDraft('convention-a', '2027')).not.toBeNull()
  })

  it('takes up a kept one with what was bought since, and drops an add-on bought meanwhile', () => {
    const kept = {
      ...extensionDraft(offer(), paid({ bought: { ...paid().bought!, addOnIds: [] } })),
    }
    const chosen = { ...kept, addOnIds: [room!, workshop!], step: 'summary' as const }

    const resumed = resumeExtension(offer(), chosen, paid())

    expect(resumed).toMatchObject({
      addOnIds: [workshop],
      step: 'summary',
      extending: { addOnIds: [room] },
    })
  })
})

describe('an unfinished checkout', () => {
  beforeEach(() => window.sessionStorage.clear())

  // It lives in the buyer's browser alone, in the tab it was started in.
  it('is kept in the tab for its edition, and read back as it was', () => {
    const draft = filled({ step: 'merch', items: [{ variantId: small!, quantity: 2 }] })

    saveDraft('convention-a', '2026', draft)

    expect(loadDraft('convention-a', '2026')).toEqual(draft)
    expect(loadDraft('convention-a', '2025')).toBeNull()
    expect(loadDraft('convention-b', '2026')).toBeNull()
    expect(window.localStorage.length).toBe(0)
  })

  it('is forgotten once its order is placed, and all of them at a sign-out', () => {
    saveDraft('convention-a', '2026', filled())
    saveDraft('convention-b', '2027', filled())
    window.sessionStorage.setItem('something-else', 'kept')

    clearDraft('convention-a', '2026')
    expect(loadDraft('convention-a', '2026')).toBeNull()
    expect(loadDraft('convention-b', '2027')).not.toBeNull()

    clearDrafts()
    expect(loadDraft('convention-b', '2027')).toBeNull()
    expect(window.sessionStorage.getItem('something-else')).toBe('kept')
  })

  // A sign-out clears it, on whatever page it happens.
  it('is forgotten when the account of the tab signs out, and not when one signs in', () => {
    let listener: (state: { account: unknown }, previous: { account: unknown }) => void = () => {}
    const stop = forgetDraftsAtSignOut((heard) => {
      listener = heard
      return () => {
        listener = () => {}
      }
    })
    saveDraft('convention-a', '2026', filled())

    listener({ account: { id: 'a' } }, { account: null })
    expect(loadDraft('convention-a', '2026')).not.toBeNull()
    listener({ account: null }, { account: { id: 'a' } })
    expect(loadDraft('convention-a', '2026')).toBeNull()

    saveDraft('convention-a', '2026', filled())
    stop()
    listener({ account: null }, { account: { id: 'a' } })
    expect(loadDraft('convention-a', '2026')).not.toBeNull()
  })

  // A sign-out clears it, also one this tab never saw: a tab that was asleep, or restored, when
  // its session ended reads nothing of the account it showed. A visitor's goes on under the
  // account that signs in.
  it('is its account’s alone, while a visitor’s goes on under the account that signs in', () => {
    saveDraft('convention-a', '2026', filled({ step: 'summary' }), 'account-a')

    expect(loadDraft('convention-a', '2026', undefined, 'account-a')).toEqual(
      filled({ step: 'summary' }),
    )
    expect(loadDraft('convention-a', '2026')).toBeNull()
    expect(loadDraft('convention-a', '2026', undefined, 'account-b')).toBeNull()

    saveDraft('convention-a', '2026', filled({ step: 'merch' }))
    expect(loadDraft('convention-a', '2026', undefined, 'account-a')).toEqual(
      filled({ step: 'merch' }),
    )
  })

  // A checkout kept before a consent came with the version of its document says nothing of
  // what was shown: it goes on with no consent accepted, and the buyer accepts them as shown now.
  it('goes on with no consent accepted when it kept consents with no version', () => {
    window.sessionStorage.setItem(
      'opos-checkout:convention-a:2026',
      JSON.stringify({
        ...filled({ step: 'summary' }),
        consents: undefined,
        consentIds: [terms],
        accountId: null,
      }),
    )

    expect(loadDraft('convention-a', '2026')).toEqual(filled({ step: 'summary', consents: [] }))
  })

  it('keeps each consent with the version of its document it was accepted with', () => {
    const draft = filled({ step: 'summary', consents: [termsAccepted, newsAccepted] })

    saveDraft('convention-a', '2026', draft)

    expect(loadDraft('convention-a', '2026')?.consents).toEqual([
      { consentId: terms, documentVersionId: termsV1 },
      { consentId: news, documentVersionId: null },
    ])
  })

  it('reads nothing from what is not a checkout', () => {
    window.sessionStorage.setItem('opos-checkout:convention-a:2026', '{"step":12}')
    expect(loadDraft('convention-a', '2026')).toBeNull()
    window.sessionStorage.setItem('opos-checkout:convention-a:2026', 'not json')
    expect(loadDraft('convention-a', '2026')).toBeNull()
  })
})
