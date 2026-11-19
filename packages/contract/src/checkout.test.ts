import { describe, expect, it } from 'vitest'
import { type Cart, cartSchema, type Offer, offerSchema, priceCart } from './checkout'

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
    },
    {
      id: WORKSHOP,
      name: 'Workshop',
      description: '',
      amountMinor: 4000,
      kind: 'limited',
      soldOut: false,
      placesLeft: 3,
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
})
