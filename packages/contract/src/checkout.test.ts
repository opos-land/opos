import { describe, expect, it } from 'vitest'
import {
  attemptHeaders,
  BOT_CHECK_STAND_IN,
  cartSchema,
  FAILURE_REASONS,
  offerSchema,
  ORDER_NUMBER_ALPHABET,
  ORDER_STATUSES,
  orderResultSchema,
  placeOrderSchema,
  placeVisitorOrderSchema,
  priceCart,
  RESULT_TOKEN_HEADER,
  resultTokenHeaders,
  startedAttemptSchema,
  type Cart,
  type DiscountTerms,
  type Offer,
  quoteRequestSchema,
} from './checkout'
import { contract } from './index'

const id = (n: number) => `0198c1a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const [STANDARD, SUPPORTER, ROOM, WORKSHOP, SHIRT, PIN, WOMENS_S, WOMENS_M, PIN_ONLY] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
].map(id) as [string, string, string, string, string, string, string, string, string]

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
  provider: null,
  documents: [],
  consents: [],
  customFields: [],
  ticketTypes: [
    {
      id: STANDARD,
      name: 'Standard',
      shortDescription: '',
      longDescription: '',
      state: 'on-sale',
      priceMinor: 12000,
      supporterPrices: [20000, 30000],
      perks: [],
      ageBands: ['teen', 'adult'],
      discountsExcluded: false,
      addOnIds: [ROOM, WORKSHOP],
      merchandiseItemIds: [SHIRT],
    },
    {
      id: SUPPORTER,
      name: 'Supporter',
      shortDescription: '',
      longDescription: '',
      state: 'sold-out',
      priceMinor: 40000,
      supporterPrices: [],
      perks: [],
      ageBands: ['adult'],
      discountsExcluded: true,
      addOnIds: [],
      merchandiseItemIds: [],
    },
  ],
  addOns: [
    {
      id: ROOM,
      name: 'Sleeping room',
      description: '',
      amountMinor: 0,
      kind: 'headcount',
      soldOut: false,
      placesLeft: null,
      picture: null,
    },
    {
      id: WORKSHOP,
      name: 'Workshop',
      description: '',
      amountMinor: 4000,
      kind: 'limited',
      soldOut: false,
      placesLeft: 3,
      picture: null,
    },
  ],
  items: [
    {
      id: SHIRT,
      name: 'T-shirt',
      description: '',
      amountMinor: 8000,
      perOrderLimit: 3,
      picturesIllustrative: false,
      pictures: [],
      axes: [
        {
          id: id(20),
          name: 'Size',
          values: [
            { id: id(21), label: 'S', sizeChart: null },
            { id: id(22), label: 'M', sizeChart: null },
          ],
        },
      ],
      variants: [
        { id: WOMENS_S, valueIds: [id(21)], maxQuantity: 3 },
        { id: WOMENS_M, valueIds: [id(22)], maxQuantity: 0 },
      ],
    },
    {
      id: PIN,
      name: 'Pin',
      description: '',
      amountMinor: 1500,
      perOrderLimit: 10,
      picturesIllustrative: false,
      pictures: [],
      axes: [],
      variants: [{ id: PIN_ONLY, valueIds: [], maxQuantity: 10 }],
    },
  ],
  ...changes,
})

const cart = (changes: Partial<Cart> = {}): Cart => ({
  ticket: { ticketTypeId: STANDARD },
  addOnIds: [],
  items: [],
  ...changes,
})

describe('the offer of a shop', () => {
  it('is what the fixture of these tests holds', () => {
    expect(offerSchema.safeParse(offer()).success).toBe(true)
  })

  // The shop never shows how much stock or capacity is left: what it says of a variant is the
  // most one order may take of it, and of a ticket type that it is sold out.
  it('says nothing of how much stock or capacity is left', () => {
    const ticketType = Object.keys(offerSchema.shape.ticketTypes.element.shape)
    const variant = Object.keys(offerSchema.shape.items.element.shape.variants.element.shape)

    expect(ticketType.join(' ')).not.toMatch(/capacity|sold|left|stock/i)
    expect(variant.sort()).toEqual(['id', 'maxQuantity', 'valueIds'])
  })
})

describe('a cart', () => {
  it('is a ticket or none, the add-ons taken with it and the variants with their quantities', () => {
    expect(
      cartSchema.parse({ ticket: null, items: [{ variantId: PIN_ONLY, quantity: 2 }] }),
    ).toEqual({ ticket: null, addOnIds: [], items: [{ variantId: PIN_ONLY, quantity: 2 }] })
    expect(
      cartSchema.safeParse({ ticket: null, items: [{ variantId: PIN_ONLY, quantity: 0 }] }).success,
    ).toBe(false)
    expect(cartSchema.safeParse({ ticket: { ticketTypeId: 'standard' } }).success).toBe(false)
  })
})

describe('the price of a cart', () => {
  it('is the price in force of the ticket type alone, for a ticket alone', () => {
    expect(priceCart(offer(), cart())).toEqual({
      lines: [
        {
          kind: 'ticket',
          ticketTypeId: STANDARD,
          name: 'Standard',
          variant: [],
          quantity: 1,
          unitAmountMinor: 12000,
          amountMinor: 12000,
        },
      ],
      totalMinor: 12000,
    })
  })

  it('adds the add-ons and the merchandise, each chosen variant a line of its own', () => {
    const priced = priceCart(
      offer(),
      cart({ addOnIds: [WORKSHOP, ROOM], items: [{ variantId: WOMENS_S, quantity: 2 }] }),
    )

    expect(priced).toMatchObject({
      lines: [
        { kind: 'ticket', amountMinor: 12000 },
        // In the order of the offer, whatever order the cart named them in.
        { kind: 'add_on', addOnId: ROOM, name: 'Sleeping room', amountMinor: 0 },
        { kind: 'add_on', addOnId: WORKSHOP, amountMinor: 4000 },
        {
          kind: 'merchandise',
          merchandiseItemId: SHIRT,
          variantId: WOMENS_S,
          name: 'T-shirt',
          variant: ['S'],
          quantity: 2,
          unitAmountMinor: 8000,
          amountMinor: 16000,
        },
      ],
      totalMinor: 32000,
    })
  })

  it('takes a supporter price the ticket type offers instead of its price', () => {
    const priced = priceCart(
      offer(),
      cart({ ticket: { ticketTypeId: STANDARD, supporterPriceMinor: 30000 } }),
    )

    expect(priced).toMatchObject({ totalMinor: 30000, lines: [{ unitAmountMinor: 30000 }] })
  })

  it('is zero for a free ticket with nothing else', () => {
    const free = offer()
    free.ticketTypes[0]!.priceMinor = 0

    expect(priceCart(free, cart())).toMatchObject({ totalMinor: 0 })
  })

  it('prices merchandise alone while merch-only orders are on, any item of the offer', () => {
    const alone = cart({ ticket: null, items: [{ variantId: PIN_ONLY, quantity: 3 }] })

    expect(priceCart(offer(), alone)).toMatchObject({
      lines: [{ kind: 'merchandise', variantId: PIN_ONLY, variant: [], amountMinor: 4500 }],
      totalMinor: 4500,
    })
    expect(priceCart(offer({ merchOnly: false }), alone)).toEqual({
      problem: { kind: 'merch-only' },
    })
  })

  it.each([
    ['nothing at all', { ticket: null }, { kind: 'empty' }],
    ['an add-on with no ticket', { ticket: null, addOnIds: [ROOM] }, { kind: 'add-on', id: ROOM }],
    [
      'a ticket type that is sold out',
      { ticket: { ticketTypeId: SUPPORTER } },
      { kind: 'ticket-type', id: SUPPORTER },
    ],
    [
      'a ticket type the offer does not hold',
      { ticket: { ticketTypeId: id(99) } },
      { kind: 'ticket-type', id: id(99) },
    ],
    [
      'a supporter price the ticket type does not offer',
      { ticket: { ticketTypeId: STANDARD, supporterPriceMinor: 25000 } },
      { kind: 'supporter-price' },
    ],
    [
      'an item the ticket type does not offer',
      { items: [{ variantId: PIN_ONLY, quantity: 1 }] },
      { kind: 'variant', id: PIN_ONLY },
    ],
    [
      'a variant with nothing left',
      { items: [{ variantId: WOMENS_M, quantity: 1 }] },
      { kind: 'variant', id: WOMENS_M },
    ],
    [
      'more of an item than a single order may take',
      { items: [{ variantId: WOMENS_S, quantity: 4 }] },
      { kind: 'variant', id: WOMENS_S },
    ],
    [
      'a variant twice',
      {
        items: [
          { variantId: WOMENS_S, quantity: 1 },
          { variantId: WOMENS_S, quantity: 1 },
        ],
      },
      { kind: 'variant', id: WOMENS_S },
    ],
    ['an add-on twice', { addOnIds: [ROOM, ROOM] }, { kind: 'add-on', id: ROOM }],
  ])('refuses %s, naming what cannot be had', (_, changes, problem) => {
    expect(priceCart(offer(), cart(changes as Partial<Cart>))).toEqual({ problem })
  })

  it('refuses an add-on that is sold out or not offered with the ticket type', () => {
    const full = offer()
    full.addOns[1]!.soldOut = true
    const narrow = offer()
    narrow.ticketTypes[0]!.addOnIds = [ROOM]

    for (const held of [full, narrow]) {
      expect(priceCart(held, cart({ addOnIds: [WORKSHOP] }))).toEqual({
        problem: { kind: 'add-on', id: WORKSHOP },
      })
    }
  })

  it('counts the limit an order over all the variants of an item', () => {
    const roomy = offer()
    roomy.items[0]!.variants[1]!.maxQuantity = 3
    const both = (first: number, second: number) =>
      cart({
        items: [
          { variantId: WOMENS_S, quantity: first },
          { variantId: WOMENS_M, quantity: second },
        ],
      })

    expect(priceCart(roomy, both(2, 1))).toMatchObject({ totalMinor: 12000 + 3 * 8000 })
    expect(priceCart(roomy, both(2, 2))).toEqual({ problem: { kind: 'variant', id: WOMENS_M } })
  })

  it('prices nothing while the shop is closed', () => {
    expect(priceCart(offer({ open: false, onSale: false }), cart())).toEqual({
      problem: { kind: 'closed' },
    })
  })

  // The last thing on sale just ran out: the buyer is told what, not that the shop is closed.
  it('names what ran out also when nothing else is on sale', () => {
    const emptied = offer({ onSale: false })
    emptied.ticketTypes[0]!.state = 'sold-out'

    expect(priceCart(emptied, cart())).toEqual({ problem: { kind: 'ticket-type', id: STANDARD } })
  })

  // Merch-only orders are on, and the offer says they are not once no variant is left to sell.
  it('names the variant that ran out also when it was the last of merchandise sold alone', () => {
    const emptied = offer({ merchOnly: false })
    const alone = cart({ ticket: null, items: [{ variantId: WOMENS_M, quantity: 1 }] })

    expect(priceCart(emptied, alone)).toEqual({ problem: { kind: 'variant', id: WOMENS_M } })
  })
})

// A discount code lowers the lines it applies to together, as one line of the order
// (docs/specs/0008-discount-codes.md, K1-K4).
describe('the price of a cart with a discount code', () => {
  const terms = (changes: Partial<DiscountTerms> = {}): DiscountTerms => ({
    code: 'early10',
    kind: 'percent',
    percent: 10,
    amountMinor: null,
    ticketTypeIds: [STANDARD],
    addOnIds: [],
    itemIds: [],
    ...changes,
  })
  const full = cart({ addOnIds: [WORKSHOP], items: [{ variantId: WOMENS_S, quantity: 2 }] })
  const discounted = (code: DiscountTerms, of: Cart = full) => {
    const priced = priceCart(offer(), of, code)
    if ('problem' in priced) throw new Error(`refused: ${priced.problem.kind}`)
    return priced
  }

  it('takes a percent off the sum of the lines the code applies to, as a line of its own', () => {
    const priced = discounted(terms())

    // 10% of the ticket alone: the workshop and the T-shirts are not the code's.
    expect(priced.lines.at(-1)).toEqual({
      kind: 'discount',
      name: 'early10',
      variant: [],
      quantity: 1,
      unitAmountMinor: -1200,
      amountMinor: -1200,
    })
    expect(priced.totalMinor).toBe(12000 + 4000 + 2 * 8000 - 1200)
  })

  it('applies to the ticket types, the add-ons and the merchandise items the code names', () => {
    const everything = terms({ percent: 50, addOnIds: [WORKSHOP], itemIds: [SHIRT] })

    expect(discounted(everything).lines.at(-1)!.amountMinor).toBe(-(12000 + 4000 + 16000) / 2)
  })

  it('rounds a percent to the grosz, half up', () => {
    const odd = offer()
    odd.ticketTypes[0]!.priceMinor = 3335
    const priced = priceCart(odd, cart(), terms({ percent: 10 }))

    // 333.5 grosz comes to 334.
    expect(priced).toMatchObject({ totalMinor: 3335 - 334 })
    const third = priceCart(odd, cart(), terms({ percent: 33 }))
    // 1100.55 grosz comes to 1101.
    expect(third).toMatchObject({ totalMinor: 3335 - 1101 })
  })

  it('takes an amount off, at most the sum of what the code applies to', () => {
    const twenty = terms({ kind: 'amount', percent: null, amountMinor: 2000 })
    const more = terms({ kind: 'amount', percent: null, amountMinor: 50000 })

    expect(discounted(twenty).totalMinor).toBe(32000 - 2000)
    // The ticket is paid for in full, and nothing else is lowered: no total goes below zero.
    expect(discounted(more).lines.at(-1)!.amountMinor).toBe(-12000)
    expect(discounted(more).totalMinor).toBe(4000 + 16000)
  })

  it('gives free entry at 100%, and leaves merchandise at its price', () => {
    const guest = terms({ percent: 100 })

    expect(discounted(guest, cart()).totalMinor).toBe(0)
    expect(
      discounted(guest, cart({ items: [{ variantId: WOMENS_S, quantity: 1 }] })).totalMinor,
    ).toBe(8000)
  })

  it('never lowers a ticket type excluded from discounts, whatever the code names', () => {
    const excluded = offer()
    excluded.ticketTypes[0]!.discountsExcluded = true

    expect(priceCart(excluded, cart(), terms())).toEqual({ problem: { kind: 'discount-code' } })
  })

  it('is refused for a cart it applies to nothing in', () => {
    const merchandise = terms({ ticketTypeIds: [], itemIds: [PIN] })

    expect(priceCart(offer(), full, merchandise)).toEqual({ problem: { kind: 'discount-code' } })
  })

  it('changes nothing of a cart that cannot be had', () => {
    expect(priceCart(offer({ open: false }), cart(), terms())).toEqual({
      problem: { kind: 'closed' },
    })
  })
})

// docs/specs/0009-buyer-self-service.md, B1-B3: what "Buy more" adds to a paid order.
describe('the price of a cart that adds to a paid order', () => {
  const more = (changes: Partial<Cart> = {}) => cart({ ticket: null, ...changes })
  const toStandard = { ticketTypeId: STANDARD, addOnIds: [] }

  it('sells no ticket, and offers the add-ons and the merchandise of the order’s ticket type', () => {
    const priced = priceCart(
      offer({ merchOnly: false }),
      more({ addOnIds: [WORKSHOP], items: [{ variantId: WOMENS_S, quantity: 1 }] }),
      undefined,
      toStandard,
    )

    expect(priced).toMatchObject({
      lines: [
        { kind: 'add_on', addOnId: WORKSHOP, amountMinor: 4000 },
        { kind: 'merchandise', variantId: WOMENS_S, amountMinor: 8000 },
      ],
      totalMinor: 12000,
    })
    // The item the ticket type does not offer stays out of reach, as in its first checkout.
    expect(
      priceCart(
        offer(),
        more({ items: [{ variantId: PIN_ONLY, quantity: 1 }] }),
        undefined,
        toStandard,
      ),
    ).toEqual({ problem: { kind: 'variant', id: PIN_ONLY } })
    expect(priceCart(offer(), cart(), undefined, toStandard)).toEqual({
      problem: { kind: 'ticket-type', id: STANDARD },
    })
  })

  it('takes an add-on once: one already bought is refused, merchandise is ordered again', () => {
    const bought = { ticketTypeId: STANDARD, addOnIds: [WORKSHOP] }

    expect(priceCart(offer(), more({ addOnIds: [WORKSHOP] }), undefined, bought)).toEqual({
      problem: { kind: 'add-on', id: WORKSHOP },
    })
    expect(
      priceCart(
        offer(),
        more({ addOnIds: [ROOM], items: [{ variantId: WOMENS_S, quantity: 2 }] }),
        undefined,
        bought,
      ),
    ).toMatchObject({ totalMinor: 16000 })
  })

  it('offers the merchandise alone to an order of merchandise alone, also with merch-only orders off', () => {
    const toMerch = { ticketTypeId: null, addOnIds: [] }
    const closed = offer({ merchOnly: false })

    expect(
      priceCart(
        closed,
        more({ items: [{ variantId: PIN_ONLY, quantity: 2 }] }),
        undefined,
        toMerch,
      ),
    ).toMatchObject({ totalMinor: 3000 })
    expect(priceCart(closed, more({ addOnIds: [ROOM] }), undefined, toMerch)).toEqual({
      problem: { kind: 'add-on', id: ROOM },
    })
    expect(priceCart(closed, more(), undefined, toMerch)).toEqual({ problem: { kind: 'empty' } })
  })

  it('offers the add-ons of a ticket type that no longer sells, and nothing while the shop is closed', () => {
    const soldOut = { ticketTypeId: SUPPORTER, addOnIds: [] }
    const types = offer().ticketTypes.map((type) =>
      type.id === SUPPORTER ? { ...type, addOnIds: [ROOM] } : type,
    )

    expect(
      priceCart(offer({ ticketTypes: types }), more({ addOnIds: [ROOM] }), undefined, soldOut),
    ).toMatchObject({ totalMinor: 0, lines: [{ kind: 'add_on', addOnId: ROOM }] })
    expect(
      priceCart(offer({ open: false }), more({ addOnIds: [ROOM] }), undefined, toStandard),
    ).toEqual({ problem: { kind: 'closed' } })
  })
})

describe('a quote', () => {
  it('takes a cart, and a discount code as the buyer typed it', () => {
    expect(quoteRequestSchema.parse({ ticket: null, discountCode: '  Early10 ' })).toEqual({
      ticket: null,
      addOnIds: [],
      items: [],
      discountCode: 'Early10',
    })
    expect(quoteRequestSchema.parse({ ticket: null })).not.toHaveProperty('discountCode')
    expect(
      quoteRequestSchema.safeParse({ ticket: null, discountCode: 'x'.repeat(61) }).success,
    ).toBe(false)
  })
})

describe('placing an order', () => {
  const order = {
    cart: { ticket: { ticketTypeId: STANDARD } },
    holderName: ' Ada ',
    ageBand: 'adult',
    expectedTotalMinor: 12000,
    botCheckToken: 'token',
  }

  it('takes the cart, the ticket holder, the total the buyer saw and the token of the bot check', () => {
    expect(placeOrderSchema.parse(order)).toEqual({
      cart: { ticket: { ticketTypeId: STANDARD }, addOnIds: [], items: [] },
      holderName: 'Ada',
      ageBand: 'adult',
      customFieldAnswers: [],
      consentIds: [],
      providerConsentAccepted: false,
      guardianConsentAcknowledged: false,
      expectedTotalMinor: 12000,
      botCheckToken: 'token',
    })
  })

  // Nobody has to be named: a name left out or blank is an empty one.
  it('takes an order with no name of the ticket holder', () => {
    for (const holderName of [undefined, '', '   ']) {
      expect(placeOrderSchema.parse({ ...order, holderName })).toMatchObject({ holderName: '' })
    }
  })

  it.each([
    ['a name of the ticket holder over 200 characters', { holderName: 'n'.repeat(201) }],
    ['no word on the age band', { ageBand: undefined }],
    ['no total', { expectedTotalMinor: undefined }],
    ['no token of the bot check', { botCheckToken: '' }],
    [
      'an answer over 200 characters',
      { customFieldAnswers: [{ fieldId: STANDARD, answer: 'a'.repeat(201) }] },
    ],
    ['a price of its own', { totalMinor: 1 }],
  ])('is refused with %s', (_, changes) => {
    expect(placeOrderSchema.safeParse({ ...order, ...changes }).success).toBe(false)
  })

  // An account buys under its own email: its route takes none, so none can be put in its place.
  it('takes no email from an account, and an email typed twice from a visitor', () => {
    const typed = { email: 'Buyer@Example.test', emailConfirmation: ' buyer@example.test ' }

    expect(placeOrderSchema.safeParse({ ...order, ...typed }).success).toBe(false)
    expect(placeVisitorOrderSchema.safeParse({ ...order, ...typed }).success).toBe(true)
    expect(placeVisitorOrderSchema.safeParse(order).success).toBe(false)
    expect(
      placeVisitorOrderSchema.safeParse({
        ...order,
        ...typed,
        emailConfirmation: 'other@example.test',
      }).success,
    ).toBe(false)
  })

  // "Buy more": an account names its own paid order; a visitor has no such thing (B6).
  it('takes the order an account adds to, and none from a visitor', () => {
    const more = { ...order, cart: { ticket: null }, ageBand: null, extendsOrderId: STANDARD }
    const typed = { email: 'buyer@example.test', emailConfirmation: 'buyer@example.test' }

    expect(placeOrderSchema.parse(more)).toMatchObject({ extendsOrderId: STANDARD })
    expect(placeOrderSchema.safeParse({ ...more, extendsOrderId: 'first' }).success).toBe(false)
    expect(placeVisitorOrderSchema.safeParse({ ...more, ...typed }).success).toBe(false)
  })

  it('numbers an order in characters that are not mistaken for one another', () => {
    expect(ORDER_NUMBER_ALPHABET).not.toMatch(/[01OIL]/)
    expect(new Set(ORDER_NUMBER_ALPHABET).size).toBe(ORDER_NUMBER_ALPHABET.length)
  })

  it('is reached under the convention and the edition by a visitor, and under the edition by an account', () => {
    expect(contract.public.placeOrder['~orpc'].route.path).toBe(
      '/public/tenants/{slug}/editions/{editionSlug}/shop/orders',
    )
    expect(contract.checkout.placeOrder['~orpc'].route.path).toBe(
      '/editions/{editionId}/shop/orders',
    )
  })
})

describe('the result of an order', () => {
  const result = {
    number: 'ABCDEFGHJK',
    status: 'awaiting-payment',
    holdEndsAt: '2026-05-01T10:30:00.000Z',
    failureReason: null,
    moneyWith: null,
    editionSlug: '2026',
  }

  // The result page shows no personal data: the order's status and number alone, with what the
  // page needs to offer another try.
  it('holds the status and the number, and nothing of the buyer', () => {
    expect(orderResultSchema.parse(result)).toEqual(result)
    expect(Object.keys(orderResultSchema.shape).sort()).toEqual([
      'editionSlug',
      'failureReason',
      'holdEndsAt',
      'moneyWith',
      'number',
      'status',
    ])
  })

  it.each(ORDER_STATUSES)('takes the status %s', (status) => {
    expect(orderResultSchema.safeParse({ ...result, status }).success).toBe(true)
  })

  it.each(FAILURE_REASONS)('takes the reason %s of a failed attempt, and no other', (reason) => {
    expect(orderResultSchema.safeParse({ ...result, failureReason: reason }).success).toBe(true)
    expect(orderResultSchema.safeParse({ ...result, failureReason: 'E-4012' }).success).toBe(false)
  })

  it('says where the money is in each language the provider has it in', () => {
    const moneyWith = { en: 'With the convention.', pl: 'U konwentu.' }

    expect(orderResultSchema.parse({ ...result, moneyWith }).moneyWith).toEqual(moneyWith)
  })
})

describe('the result token', () => {
  // It travels in a header, never in a path or a query of the API.
  it('is a header of its own, and is not empty', () => {
    expect(RESULT_TOKEN_HEADER).toBe('x-result-token')
    expect(resultTokenHeaders.safeParse({ 'x-result-token': 'abc' }).success).toBe(true)
    expect(resultTokenHeaders.safeParse({ 'x-result-token': '' }).success).toBe(false)
    expect(resultTokenHeaders.safeParse({}).success).toBe(false)
  })
})

describe('the start of a payment attempt', () => {
  // The provider's pages follow the language of the buyer's interface, which travels as any
  // request's does.
  it('takes the language of the buyer’s interface beside the result token', () => {
    const headers = attemptHeaders.parse({ 'x-result-token': 'abc', 'accept-language': 'en' })

    expect(headers).toEqual({ 'x-result-token': 'abc', 'accept-language': 'en' })
    expect(attemptHeaders.safeParse({ 'x-result-token': 'abc' }).success).toBe(true)
    expect(attemptHeaders.safeParse({ 'accept-language': 'en' }).success).toBe(false)
  })
})

describe('a started payment attempt', () => {
  it('answers where to send the buyer, as an address', () => {
    const started = { redirectUrl: 'https://provider.test/pay/1' }

    expect(startedAttemptSchema.parse(started)).toEqual(started)
    expect(startedAttemptSchema.safeParse({ redirectUrl: 'pay/1' }).success).toBe(false)
  })
})

describe('the bot check', () => {
  // Until the portal's own check is built, a stand-in token passes on local and dev alone.
  it('has a stand-in token that is no secret and fits the field', () => {
    expect(BOT_CHECK_STAND_IN).toBe('stand-in-bot-check-passed')
  })
})
