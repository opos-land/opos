import { parseMoney } from '@opos/i18n'
import { describe, expect, it } from 'vitest'
import { addOnBody, addOnFields, EMPTY_ADD_ON } from './add-on-form'

const fields = (values: Partial<typeof EMPTY_ADD_ON> = {}) => ({
  ...EMPTY_ADD_ON,
  name: 'Workshop',
  price: '40',
  ...values,
})

describe('the form of an add-on', () => {
  it('reads a free add-on without a limit', () => {
    expect(
      addOnBody(fields({ name: ' Room ', price: '0', description: ' On the floor. ' }), parseMoney),
    ).toEqual({
      body: {
        name: 'Room',
        description: 'On the floor.',
        amountMinor: 0,
        kind: 'unlimited',
        capacity: null,
        placesLeftThreshold: null,
      },
    })
  })

  it('reads a limited add-on with its capacity and its threshold, or no threshold', () => {
    const limited = fields({ kind: 'limited', capacity: '30', threshold: '5' })

    expect(addOnBody(limited, parseMoney)).toMatchObject({
      body: { amountMinor: 4000, kind: 'limited', capacity: 30, placesLeftThreshold: 5 },
    })
    expect(addOnBody({ ...limited, threshold: ' ' }, parseMoney)).toMatchObject({
      body: { capacity: 30, placesLeftThreshold: null },
    })
  })

  // What the fields of a limited add-on held stays in the form while another kind is chosen, and
  // is not sent: a kind that is not limited has no capacity.
  it('sends no capacity and no threshold of a kind that is not limited', () => {
    expect(
      addOnBody(fields({ kind: 'headcount', capacity: '30', threshold: '5' }), parseMoney),
    ).toMatchObject({ body: { kind: 'headcount', capacity: null, placesLeftThreshold: null } })
  })

  it.each([
    ['no name', { name: ' ' }, ['name']],
    ['a price that is no amount', { price: 'free' }, ['price']],
    ['a limited one with no capacity', { kind: 'limited' as const }, ['capacity']],
    [
      'a capacity that is no whole number',
      { kind: 'limited' as const, capacity: '2.5' },
      ['capacity'],
    ],
    [
      'a threshold below one',
      { kind: 'limited' as const, capacity: '10', threshold: '0' },
      ['threshold'],
    ],
    ['several at once', { name: '', price: '-1' }, ['name', 'price']],
  ])('names what is wrong with %s', (_, values, problems) => {
    expect(addOnBody(fields(values), parseMoney)).toEqual({ problems })
  })

  it('fills the form from an add-on, its price as a field holds it', () => {
    expect(
      addOnFields(
        {
          id: 'a',
          editionId: 'e',
          name: 'Workshop',
          description: 'Two hours.',
          amountMinor: 4050,
          kind: 'limited',
          capacity: 30,
          placesLeftThreshold: null,
          position: 1,
          hidden: false,
        },
        (amount) => (amount / 100).toFixed(2),
      ),
    ).toEqual({
      name: 'Workshop',
      description: 'Two hours.',
      price: '40.50',
      kind: 'limited',
      capacity: '30',
      threshold: '',
    })
  })
})
