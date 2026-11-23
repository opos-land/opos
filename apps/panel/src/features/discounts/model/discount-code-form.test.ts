import { type DiscountCode } from '@opos/contract'
import { describe, expect, it } from 'vitest'
import {
  discountCodeBody,
  discountCodeFields,
  type DiscountCodeFields,
  EMPTY_DISCOUNT_CODE,
  shownCode,
  standingOf,
} from './discount-code-form'

const readers = {
  parse: (text: string) =>
    /^\d+(\.\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text.trim()) * 100) : null,
  fromInput: (value: string) => (value ? `${value}:00.000Z` : null),
}

const filled = (changes: Partial<DiscountCodeFields> = {}): DiscountCodeFields => ({
  ...EMPTY_DISCOUNT_CODE,
  code: 'early-10',
  percent: '10',
  validFrom: '2099-01-01T10:00',
  validUntil: '2099-02-01T10:00',
  ticketTypeIds: ['standard'],
  ...changes,
})

const problemsOf = (changes: Partial<DiscountCodeFields>) => {
  const read = discountCodeBody(filled(changes), readers)
  return 'problems' in read ? read.problems : []
}

// docs/specs/0008-discount-codes.md, D1-D4.
describe('the request a discount code form makes', () => {
  it('is a percent code with no limit, its window as moments', () => {
    const read = discountCodeBody(filled({ code: '  Early-10 ' }), readers)

    expect(read).toEqual({
      body: {
        code: 'Early-10',
        kind: 'percent',
        percent: 10,
        usageLimit: null,
        validFrom: '2099-01-01T10:00:00.000Z',
        validUntil: '2099-02-01T10:00:00.000Z',
        ticketTypeIds: ['standard'],
        addOnIds: [],
        itemIds: [],
      },
    })
  })

  it('is an amount code with a limit, and never carries the value of the other kind', () => {
    const read = discountCodeBody(
      filled({
        kind: 'amount',
        amount: '25.50',
        usageLimit: ' 100 ',
        ticketTypeIds: [],
        addOnIds: ['room'],
        itemIds: ['pin'],
      }),
      readers,
    )

    expect(read).toMatchObject({
      body: { kind: 'amount', amountMinor: 2550, usageLimit: 100, addOnIds: ['room'] },
    })
    expect('body' in read && read.body).not.toHaveProperty('percent')
  })

  it.each<[string, Partial<DiscountCodeFields>, string]>([
    ['a code shorter than four characters', { code: 'abc' }, 'code'],
    ['a code with a character that is no letter, digit or hyphen', { code: 'early 10' }, 'code'],
    ['a code longer than forty characters', { code: 'a'.repeat(41) }, 'code'],
    ['a percent of zero', { percent: '0' }, 'percent'],
    ['a percent above a hundred', { percent: '101' }, 'percent'],
    ['a percent that is no whole number', { percent: '12.5' }, 'percent'],
    ['an amount of zero', { kind: 'amount', amount: '0' }, 'amount'],
    ['an amount that is no amount', { kind: 'amount', amount: 'ten' }, 'amount'],
    ['a limit of zero', { usageLimit: '0' }, 'usageLimit'],
    ['a limit that is no number', { usageLimit: 'few' }, 'usageLimit'],
    ['a window with no end', { validUntil: '' }, 'window'],
    ['a window that ends before it starts', { validUntil: '2098-01-01T10:00' }, 'window'],
    ['nothing to apply to', { ticketTypeIds: [] }, 'appliesTo'],
  ])('names %s', (_, changes, problem) => {
    expect(problemsOf(changes)).toEqual([problem])
  })

  it('asks nothing of the value of the other kind', () => {
    expect(problemsOf({ kind: 'percent', amount: 'ten' })).toEqual([])
    expect(problemsOf({ kind: 'amount', amount: '5', percent: 'x' })).toEqual([])
  })
})

const stored = (changes: Partial<DiscountCode> = {}): DiscountCode => ({
  id: 'code-1',
  code: 'early10',
  kind: 'percent',
  percent: 10,
  amountMinor: null,
  usageLimit: 5,
  uses: 2,
  validFrom: '2026-01-01T10:00:00.000Z',
  validUntil: '2026-12-01T10:00:00.000Z',
  ended: false,
  ticketTypeIds: ['standard'],
  addOnIds: [],
  itemIds: ['pin'],
  ...changes,
})

describe('the form of a discount code that exists', () => {
  const writers = {
    toInput: (amountMinor: number) => (amountMinor / 100).toFixed(2),
    toInputTime: (iso: string) => iso.slice(0, 16),
  }

  it('holds what the code holds, as a person types it', () => {
    expect(discountCodeFields(stored(), writers)).toEqual({
      code: 'EARLY10',
      kind: 'percent',
      percent: '10',
      amount: '',
      usageLimit: '5',
      validFrom: '2026-01-01T10:00',
      validUntil: '2026-12-01T10:00',
      ticketTypeIds: ['standard'],
      addOnIds: [],
      itemIds: ['pin'],
    })
    expect(
      discountCodeFields(
        stored({ kind: 'amount', percent: null, amountMinor: 2550, usageLimit: null }),
        writers,
      ),
    ).toMatchObject({ kind: 'amount', percent: '', amount: '25.50', usageLimit: '' })
  })
})

describe('a discount code as the panel shows it', () => {
  it('is written in capitals, as a buyer sees it', () => {
    expect(shownCode('early-10')).toBe('EARLY-10')
  })

  // D5 and K4: why a code would be refused now, the first reason that holds.
  it.each([
    ['ended', { ended: true }],
    ['expired', { validUntil: '2026-06-01T00:00:00.000Z' }],
    ['not-yet', { validFrom: '2026-08-01T00:00:00.000Z' }],
    ['used-up', { usageLimit: 2 }],
    ['active', {}],
    ['active', { usageLimit: null, uses: 900 }],
  ] as const)('stands as %s', (standing, changes) => {
    expect(standingOf(stored(changes), new Date('2026-07-01T00:00:00.000Z'))).toBe(standing)
  })

  it('is expired from the very moment its window ends, and valid from the one it starts', () => {
    const code = stored()

    expect(standingOf(code, new Date(code.validUntil))).toBe('expired')
    expect(standingOf(code, new Date(code.validFrom))).toBe('active')
  })
})
