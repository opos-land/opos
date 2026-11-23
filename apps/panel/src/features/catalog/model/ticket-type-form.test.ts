import { parseMoney } from '@opos/i18n'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_TICKET_TYPE,
  ticketTypeBody,
  ticketTypeFields,
  type TicketTypeFields,
} from './ticket-type-form'

// The wall-clock times of a zone two hours ahead of UTC, as the tenant's time would read them.
const fromInput = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00.000+02:00` : null
const read = (fields: TicketTypeFields) => ticketTypeBody(fields, { parse: parseMoney, fromInput })

const fields = (values: Partial<TicketTypeFields> = {}): TicketTypeFields => ({
  ...EMPTY_TICKET_TYPE,
  name: 'Standard',
  saleStartsAt: '2027-01-01T10:00',
  saleEndsAt: '2027-06-01T10:00',
  ageBands: ['adult'],
  ...values,
})
const tier = (price: string, startsAt: string, endsAt: string) => ({ price, startsAt, endsAt })

describe('the form of a ticket type', () => {
  it('reads a ticket type with nothing but what every one has', () => {
    expect(read(fields({ name: ' Standard ' }))).toEqual({
      body: {
        name: 'Standard',
        shortDescription: '',
        longDescription: '',
        capacity: null,
        saleStartsAt: '2027-01-01T10:00:00.000+02:00',
        saleEndsAt: '2027-06-01T10:00:00.000+02:00',
        ageBands: ['adult'],
        discountsExcluded: false,
        shownOutsideSaleWindow: false,
        tiers: [],
        supporterPrices: [],
        perks: [],
        addOnIds: [],
        merchandiseItemIds: [],
      },
    })
  })

  it('reads the capacity, the tiers, the supporter prices and the perks', () => {
    const body = read(
      fields({
        capacity: ' 800 ',
        ageBands: ['adult', 'child'],
        tiers: [
          tier('120', '2027-01-01T10:00', '2027-03-01T00:00'),
          tier('150,50', '2027-03-01T00:00', '2027-06-01T10:00'),
        ],
        supporterPrices: ['200', ' ', '300.00'],
        perks: [' A pin ', '', 'A badge'],
        addOnIds: ['a'],
        merchandiseItemIds: ['m'],
      }),
    )

    expect(body).toMatchObject({
      body: {
        capacity: 800,
        // In the order of the bands, whatever order they were ticked in.
        ageBands: ['child', 'adult'],
        tiers: [
          {
            amountMinor: 12000,
            startsAt: '2027-01-01T10:00:00.000+02:00',
            endsAt: '2027-03-01T00:00:00.000+02:00',
          },
          { amountMinor: 15050 },
        ],
        // A row left empty is no price and no perk.
        supporterPrices: [20000, 30000],
        perks: ['A pin', 'A badge'],
        addOnIds: ['a'],
        merchandiseItemIds: ['m'],
      },
    })
  })

  it.each([
    ['no name', { name: ' ' }, ['name']],
    ['a sale window with no end', { saleEndsAt: '' }, ['saleWindow']],
    [
      'a sale window that ends before it starts',
      { saleEndsAt: '2027-01-01T09:59' },
      ['saleWindow'],
    ],
    ['a capacity that is no whole number', { capacity: 'many' }, ['capacity']],
    ['no age band', { ageBands: [] }, ['ageBands']],
    [
      'a tier with no price',
      { tiers: [tier('', '2027-01-01T10:00', '2027-02-01T10:00')] },
      ['tiers'],
    ],
    [
      'a tier that ends before it starts',
      { tiers: [tier('10', '2027-02-01T10:00', '2027-02-01T10:00')] },
      ['tiers'],
    ],
    [
      'tiers that overlap',
      {
        tiers: [
          tier('10', '2027-01-01T10:00', '2027-03-01T10:00'),
          tier('20', '2027-02-01T10:00', '2027-04-01T10:00'),
        ],
      },
      ['tiersOverlap'],
    ],
    ['a supporter price of zero', { supporterPrices: ['0'] }, ['supporterPrices']],
    ['a supporter price twice', { supporterPrices: ['200', '200,00'] }, ['supporterPrices']],
    ['a supporter price that is no amount', { supporterPrices: ['lots'] }, ['supporterPrices']],
    ['several at once', { name: '', ageBands: [] }, ['name', 'ageBands']],
  ])('names what is wrong with %s', (_, values, problems) => {
    expect(read(fields(values))).toEqual({ problems })
  })

  it('lets two tiers touch: one ends at the moment the next one starts', () => {
    expect(
      read(
        fields({
          tiers: [
            tier('10', '2027-01-01T10:00', '2027-03-01T10:00'),
            tier('20', '2027-03-01T10:00', '2027-04-01T10:00'),
          ],
        }),
      ),
    ).toMatchObject({ body: { tiers: [{ amountMinor: 1000 }, { amountMinor: 2000 }] } })
  })

  it('fills the form from a ticket type, its prices and moments as fields hold them', () => {
    expect(
      ticketTypeFields(
        {
          id: 't',
          editionId: 'e',
          name: 'Standard',
          shortDescription: 'Three days.',
          longDescription: '',
          capacity: 800,
          saleStartsAt: '2027-01-01T08:00:00.000Z',
          saleEndsAt: '2027-06-01T08:00:00.000Z',
          ageBands: ['teen', 'adult'],
          discountsExcluded: true,
          shownOutsideSaleWindow: false,
          position: 1,
          hidden: false,
          tiers: [
            {
              amountMinor: 12050,
              startsAt: '2027-01-01T08:00:00.000Z',
              endsAt: '2027-03-01T08:00:00.000Z',
            },
          ],
          supporterPrices: [20000],
          perks: ['A pin'],
          addOnIds: ['a'],
          merchandiseItemIds: [],
        },
        { toInput: (amount) => (amount / 100).toFixed(2), toInputTime: (iso) => iso.slice(0, 16) },
      ),
    ).toEqual({
      name: 'Standard',
      shortDescription: 'Three days.',
      longDescription: '',
      capacity: '800',
      saleStartsAt: '2027-01-01T08:00',
      saleEndsAt: '2027-06-01T08:00',
      ageBands: ['teen', 'adult'],
      discountsExcluded: true,
      shownOutsideSaleWindow: false,
      tiers: [{ price: '120.50', startsAt: '2027-01-01T08:00', endsAt: '2027-03-01T08:00' }],
      supporterPrices: ['200.00'],
      perks: ['A pin'],
      addOnIds: ['a'],
      merchandiseItemIds: [],
    })
  })
})
