import { type AddOn, type MerchandiseItem, type TicketType } from '@opos/contract'
import { describe, expect, it } from 'vitest'
import { EMPTY_MANUAL_ORDER, manualOrderBody, manualOrderLines, offeredTo } from './manual-order'

// A sale made outside the shop, as the screen holds it and sends it
// (docs/specs/0006-order-management.md, M1-M4).

const NOW = new Date('2026-06-01T12:00:00Z')
const ticketType = (fields: Partial<TicketType> = {}) =>
  ({
    id: 'standard',
    name: 'Standard',
    hidden: false,
    saleStartsAt: '2026-01-01T00:00:00.000Z',
    saleEndsAt: '2026-12-31T00:00:00.000Z',
    tiers: [
      {
        amountMinor: 8000,
        startsAt: '2026-01-01T00:00:00.000Z',
        endsAt: '2026-05-01T00:00:00.000Z',
      },
      {
        amountMinor: 12000,
        startsAt: '2026-05-01T00:00:00.000Z',
        endsAt: '2026-12-31T00:00:00.000Z',
      },
    ],
    ageBands: ['teen', 'adult'],
    addOnIds: ['room'],
    merchandiseItemIds: ['shirt'],
    ...fields,
  }) as TicketType
const room = { id: 'room', name: 'Room', amountMinor: 2500, hidden: false } as AddOn
const shirt = {
  id: 'shirt',
  name: 'Shirt',
  amountMinor: 5000,
  hidden: false,
  axes: [{ id: 'size', name: 'Size', values: [{ id: 'l', label: 'L' }] }],
  variants: [
    { id: 'shirt-l', valueIds: ['l'], stock: 5, hidden: false },
    { id: 'shirt-old', valueIds: [], stock: 5, hidden: true },
  ],
} as unknown as MerchandiseItem
const pin = {
  id: 'pin',
  name: 'Pin',
  amountMinor: 1500,
  hidden: false,
  axes: [],
  variants: [{ id: 'pin-one', valueIds: [], stock: null, hidden: false }],
} as unknown as MerchandiseItem
const catalog = { ticketTypes: [ticketType()], addOns: [room], items: [shirt, pin] }

describe('offeredTo', () => {
  it('offers with a ticket type its add-ons and its items, and every item without a ticket', () => {
    const withTicket = offeredTo(catalog, 'standard', NOW)
    expect(withTicket.ticketType).toMatchObject({ id: 'standard', priceMinor: 12000 })
    expect(withTicket.addOns.map((addOn) => addOn.id)).toEqual(['room'])
    expect(withTicket.items.map((item) => item.id)).toEqual(['shirt'])
    // A hidden variant is not sold.
    expect(withTicket.items[0]!.variants).toEqual([{ id: 'shirt-l', label: 'L' }])

    const alone = offeredTo(catalog, '', NOW)
    expect(alone.ticketType).toBeNull()
    expect(alone.addOns).toEqual([])
    expect(alone.items.map((item) => item.id)).toEqual(['shirt', 'pin'])
  })

  it('lists the ticket types with a price in force, and no hidden one', () => {
    const types = [
      ticketType(),
      ticketType({ id: 'hidden', hidden: true }),
      ticketType({ id: 'over', saleEndsAt: '2026-02-01T00:00:00.000Z' }),
    ]

    expect(
      offeredTo({ ...catalog, ticketTypes: types }, '', NOW).ticketTypes.map((type) => type.id),
    ).toEqual(['standard'])
  })
})

describe('manualOrderLines', () => {
  const draft = {
    ...EMPTY_MANUAL_ORDER,
    ticketTypeId: 'standard',
    addOnIds: ['room'],
    quantities: { 'shirt-l': 2, 'pin-one': 0 },
  }

  it('prices what was chosen at the tier in force', () => {
    expect(manualOrderLines(catalog, draft, NOW)).toEqual({
      lines: [
        { name: 'Standard', quantity: 1, amountMinor: 12000 },
        { name: 'Room', quantity: 1, amountMinor: 2500 },
        { name: 'Shirt (L)', quantity: 2, amountMinor: 10000 },
      ],
      totalMinor: 24500,
    })
  })

  it('costs nothing when it is complimentary', () => {
    const free = manualOrderLines(catalog, { ...draft, reason: 'complimentary' }, NOW)

    expect(free.totalMinor).toBe(0)
    expect(free.lines.map((line) => line.amountMinor)).toEqual([0, 0, 0])
  })
})

describe('manualOrderBody', () => {
  it('sends the reason and what was sold, a name and a note only when typed', () => {
    expect(
      manualOrderBody(
        catalog,
        {
          ...EMPTY_MANUAL_ORDER,
          reason: 'invoice',
          note: ' Invoice 7 ',
          ticketTypeId: 'standard',
          addOnIds: ['room'],
          quantities: { 'shirt-l': 2, 'pin-one': 0 },
          holderName: ' Ada ',
          ageBand: 'adult',
          answers: { city: ' Gdynia ', club: '  ' },
        },
        NOW,
      ),
    ).toEqual({
      reason: 'invoice',
      note: 'Invoice 7',
      cart: {
        ticket: { ticketTypeId: 'standard' },
        addOnIds: ['room'],
        items: [{ variantId: 'shirt-l', quantity: 2 }],
      },
      holderName: 'Ada',
      ageBand: 'adult',
      customFieldAnswers: [{ fieldId: 'city', answer: 'Gdynia' }],
    })
  })

  it('has no ticket holder without a ticket: no age band, no answer, no add-on', () => {
    expect(
      manualOrderBody(
        catalog,
        {
          ...EMPTY_MANUAL_ORDER,
          addOnIds: ['room'],
          quantities: { 'pin-one': 1 },
          ageBand: 'adult',
          answers: { city: 'Gdynia' },
        },
        NOW,
      ),
    ).toEqual({
      reason: 'desk',
      note: null,
      cart: { ticket: null, addOnIds: [], items: [{ variantId: 'pin-one', quantity: 1 }] },
      holderName: '',
      ageBand: null,
      customFieldAnswers: [],
    })
  })

  it('sends of the merchandise only what the screen offers with the ticket type chosen', () => {
    // The pin was counted before the ticket type was chosen, which does not offer it; so was a
    // variant that is hidden.
    const draft = {
      ...EMPTY_MANUAL_ORDER,
      ticketTypeId: 'standard',
      quantities: { 'pin-one': 2, 'shirt-l': 1, 'shirt-old': 3 },
    }

    expect(manualOrderBody(catalog, draft, NOW).cart.items).toEqual([
      { variantId: 'shirt-l', quantity: 1 },
    ])
    expect(manualOrderLines(catalog, draft, NOW).lines.map((line) => line.name)).toEqual([
      'Standard',
      'Shirt (L)',
    ])
    // Without a ticket every item is offered again, with what was counted of it.
    expect(manualOrderBody(catalog, { ...draft, ticketTypeId: '' }, NOW).cart.items).toEqual([
      { variantId: 'shirt-l', quantity: 1 },
      { variantId: 'pin-one', quantity: 2 },
    ])
  })
})
