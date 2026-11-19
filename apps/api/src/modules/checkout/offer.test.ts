import { type AddOn, type MerchandiseItem, type TicketType } from '@opos/contract'
import { describe, expect, it } from 'vitest'
import { offeredAddOn, offeredItem, offeredTicketType } from './offer'

const at = (moment: string) => new Date(moment)

const ticketType = (values: Partial<TicketType> = {}): TicketType => ({
  id: 't',
  editionId: 'e',
  name: 'Standard',
  shortDescription: '',
  longDescription: '',
  capacity: null,
  saleStartsAt: '2027-01-01T00:00:00.000Z',
  saleEndsAt: '2027-06-01T00:00:00.000Z',
  ageBands: ['adult'],
  discountsExcluded: false,
  shownOutsideSaleWindow: true,
  position: 1,
  hidden: false,
  tiers: [
    {
      amountMinor: 12000,
      startsAt: '2027-01-01T00:00:00.000Z',
      endsAt: '2027-03-01T00:00:00.000Z',
    },
    {
      amountMinor: 15000,
      startsAt: '2027-04-01T00:00:00.000Z',
      endsAt: '2027-06-01T00:00:00.000Z',
    },
  ],
  supporterPrices: [12000, 20000],
  perks: [],
  addOnIds: [],
  merchandiseItemIds: [],
  ...values,
})

describe('a ticket type as the shop offers it', () => {
  const state = (moment: string, values: Partial<TicketType> = {}, held = 0) => {
    const offered = offeredTicketType(ticketType(values), at(moment), held)
    return offered && [offered.state, offered.priceMinor]
  }

  it('is on sale at the price of the tier covering the moment, inside its sale window', () => {
    expect(state('2027-02-01T00:00:00.000Z')).toEqual(['on-sale', 12000])
    expect(state('2027-05-01T00:00:00.000Z')).toEqual(['on-sale', 15000])
  })

  it('belongs to its sale window from its start, and no longer at its end', () => {
    expect(state('2026-12-31T23:59:59.999Z')).toEqual(['not-yet', null])
    expect(state('2027-01-01T00:00:00.000Z')).toEqual(['on-sale', 12000])
    expect(state('2027-05-31T23:59:59.999Z')).toEqual(['on-sale', 15000])
    expect(state('2027-06-01T00:00:00.000Z')).toEqual(['closed', null])
  })

  it('is not yet on sale between two tiers, and closed once none is still to come', () => {
    expect(state('2027-03-15T00:00:00.000Z')).toEqual(['not-yet', null])
    expect(state('2027-03-15T00:00:00.000Z', { tiers: ticketType().tiers.slice(0, 1) })).toEqual([
      'closed',
      null,
    ])
  })

  it('is left out outside its sale window unless its org shows it there, and when hidden', () => {
    const quiet = { shownOutsideSaleWindow: false }

    expect(state('2026-06-01T00:00:00.000Z', quiet)).toBeUndefined()
    expect(state('2027-03-15T00:00:00.000Z', quiet)).toBeUndefined()
    expect(state('2027-02-01T00:00:00.000Z', quiet)).toEqual(['on-sale', 12000])
    expect(state('2027-02-01T00:00:00.000Z', { hidden: true })).toBeUndefined()
  })

  it('is sold out once orders hold its whole capacity, and never without one', () => {
    expect(state('2027-02-01T00:00:00.000Z', { capacity: 2 }, 1)).toEqual(['on-sale', 12000])
    expect(state('2027-02-01T00:00:00.000Z', { capacity: 2 }, 2)).toEqual(['sold-out', 12000])
    expect(state('2027-02-01T00:00:00.000Z', { capacity: 0 }, 0)).toEqual(['sold-out', 12000])
    expect(state('2027-02-01T00:00:00.000Z', { capacity: null }, 10_000)).toEqual([
      'on-sale',
      12000,
    ])
  })

  it('offers the supporter prices above the price in force alone', () => {
    const offered = (moment: string) =>
      offeredTicketType(ticketType(), at(moment), 0)!.supporterPrices

    expect(offered('2027-02-01T00:00:00.000Z')).toEqual([20000])
    expect(offered('2027-03-15T00:00:00.000Z')).toEqual([])
  })
})

describe('an add-on as the shop offers it', () => {
  const addOn = (values: Partial<AddOn> = {}): AddOn => ({
    id: 'a',
    editionId: 'e',
    name: 'Workshop',
    description: '',
    amountMinor: 4000,
    kind: 'limited',
    capacity: 10,
    placesLeftThreshold: 3,
    position: 1,
    hidden: false,
    ...values,
  })
  const places = (held: number, values: Partial<AddOn> = {}) => {
    const { soldOut, placesLeft } = offeredAddOn(addOn(values), held)
    return [soldOut, placesLeft]
  }

  it('says how many places are left only below its threshold', () => {
    expect(places(0)).toEqual([false, null])
    expect(places(7)).toEqual([false, null])
    expect(places(8)).toEqual([false, 2])
    expect(places(10)).toEqual([true, 0])
    // More held than it has, after its capacity was lowered: still none left, never fewer.
    expect(places(12)).toEqual([true, 0])
  })

  it('never says how many are left without a threshold, and never runs out without a capacity', () => {
    expect(places(9, { placesLeftThreshold: null })).toEqual([false, null])
    expect(places(10, { placesLeftThreshold: null })).toEqual([true, null])
    const headcount = { kind: 'headcount', capacity: null, placesLeftThreshold: null } as const
    expect(places(1_000_000, headcount)).toEqual([false, null])
  })
})

describe('an item as the shop offers it', () => {
  const item = (stock: number | null, hidden = false): MerchandiseItem => ({
    id: 'i',
    editionId: 'e',
    name: 'Pin',
    description: '',
    amountMinor: 1500,
    perOrderLimit: 5,
    picturesIllustrative: false,
    position: 1,
    hidden: false,
    axes: [],
    variants: [{ id: 'v', valueIds: [], stock, hidden }],
    pictures: [],
  })
  const now = at('2027-02-01T00:00:00.000Z')
  const most = (stock: number | null, held = 0, deadline: string | null = null) =>
    offeredItem(
      item(stock),
      now,
      deadline ? at(deadline) : null,
      new Map([['v', held]]),
    ).variants.map((variant) => variant.maxQuantity)

  it('lets an order take what orders have not taken of a variant, up to the limit an order', () => {
    expect(most(100)).toEqual([5])
    expect(most(4)).toEqual([4])
    expect(most(4, 3)).toEqual([1])
    expect(most(4, 4)).toEqual([0])
    expect(most(4, 9)).toEqual([0])
  })

  it('sells an unlimited variant until the pre-order deadline, and nothing with none', () => {
    expect(most(null, 50, '2027-02-01T00:00:00.001Z')).toEqual([5])
    // The deadline itself is past it.
    expect(most(null, 50, '2027-02-01T00:00:00.000Z')).toEqual([0])
    expect(most(null)).toEqual([0])
  })

  it('leaves a hidden variant out', () => {
    expect(offeredItem(item(10, true), now, null, new Map()).variants).toEqual([])
  })
})
