import { type AddOn } from '@opos/contract'
import { describe, expect, it } from 'vitest'
import { limitAfter } from './add-ons.controller'

const addOn = (values: Partial<AddOn> = {}): AddOn => ({
  id: '0198c1a0-0000-7000-8000-000000000001',
  editionId: '0198c1a0-0000-7000-8000-000000000002',
  name: 'Workshop',
  description: '',
  amountMinor: 4000,
  kind: 'unlimited',
  capacity: null,
  placesLeftThreshold: null,
  position: 1,
  hidden: false,
  picture: null,
  ...values,
})

const limited = addOn({ kind: 'limited', capacity: 30, placesLeftThreshold: 5 })

describe('what a change leaves of the limit of an add-on', () => {
  it('lets a kind that is no longer limited go of its capacity and its threshold', () => {
    expect(limitAfter(limited, { kind: 'headcount' })).toEqual({
      kind: 'headcount',
      capacity: null,
      placesLeftThreshold: null,
    })
  })

  it('keeps the limit of an add-on whose kind does not change', () => {
    expect(limitAfter(limited, { name: 'Seminar' })).toEqual({ name: 'Seminar' })
    expect(limitAfter(limited, { capacity: 10 })).toEqual({ capacity: 10 })
    expect(limitAfter(limited, { placesLeftThreshold: null })).toEqual({
      placesLeftThreshold: null,
    })
  })

  it.each([
    ['a limited kind with no capacity', addOn(), { kind: 'limited' } as const, 'capacity'],
    ['a capacity on an unlimited add-on', addOn(), { capacity: 3 }, 'capacity'],
    [
      'a threshold on an unlimited add-on',
      addOn(),
      { placesLeftThreshold: 3 },
      'placesLeftThreshold',
    ],
    ['a limited add-on with its capacity taken away', limited, { capacity: null }, 'capacity'],
    [
      'a kind that is no longer limited, with a capacity named anew',
      limited,
      { kind: 'unlimited', capacity: 3 } as const,
      'capacity',
    ],
  ])('refuses %s, naming the field', (_, stored, changes, field) => {
    expect(() => limitAfter(stored, changes)).toThrow(
      expect.objectContaining({ code: 'request.invalid', params: { field } }),
    )
  })
})
