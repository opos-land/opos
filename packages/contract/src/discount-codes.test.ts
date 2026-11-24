import { describe, expect, it } from 'vitest'
import { createDiscountCodeSchema, updateDiscountCodeSchema } from './discount-codes'

// The discount codes an org sets for an edition (docs/specs/0008-discount-codes.md, D1-D5).

const TYPE = '00000000-0000-4000-8000-000000000001'
const code = (changes: object = {}) => ({
  code: 'Early-10',
  kind: 'percent',
  percent: 10,
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2026-06-01T00:00:00.000Z',
  ticketTypeIds: [TYPE],
  ...changes,
})

describe('a new discount code', () => {
  it('is kept in lower case, with no limit and nothing else it applies to unless told', () => {
    expect(createDiscountCodeSchema.parse(code())).toEqual({
      code: 'early-10',
      kind: 'percent',
      percent: 10,
      usageLimit: null,
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2026-06-01T00:00:00.000Z',
      ticketTypeIds: [TYPE],
      addOnIds: [],
      itemIds: [],
    })
  })

  it.each([
    ['a code of three characters', { code: 'abc' }],
    ['a code with a space', { code: 'early 10' }],
    ['a code of 41 characters', { code: 'a'.repeat(41) }],
    ['a percent of zero', { percent: 0 }],
    ['a percent above a hundred', { percent: 101 }],
    ['a percent code with an amount', { amountMinor: 500 }],
    ['an amount code with no amount', { kind: 'amount', percent: undefined }],
    ['an amount code with a percent', { kind: 'amount', amountMinor: 500 }],
    ['a limit of no use at all', { usageLimit: 0 }],
    ['a window that ends before it starts', { validUntil: '2025-12-31T00:00:00.000Z' }],
    ['nothing it applies to', { ticketTypeIds: [] }],
    ['a field of its own', { uses: 3 }],
  ])('refuses %s', (_, changes) => {
    expect(createDiscountCodeSchema.safeParse(code(changes)).success).toBe(false)
  })

  // The API fills a window left out: from now until the edition ends.
  it('leaves its window to the API when either end is left out', () => {
    const open = code({ validFrom: undefined, validUntil: undefined })

    expect(createDiscountCodeSchema.parse(open)).toMatchObject({
      validFrom: undefined,
      validUntil: undefined,
    })
    expect(createDiscountCodeSchema.safeParse(code({ validFrom: undefined })).success).toBe(true)
    expect(createDiscountCodeSchema.safeParse(code({ validUntil: undefined })).success).toBe(true)
  })

  // A thing is named once: a code applies to it or it does not.
  it('names each thing it applies to once', () => {
    const twice = { ticketTypeIds: [TYPE, TYPE] }

    expect(createDiscountCodeSchema.safeParse(code(twice)).success).toBe(false)
    expect(updateDiscountCodeSchema.safeParse({ addOnIds: [TYPE, TYPE] }).success).toBe(false)
    expect(updateDiscountCodeSchema.safeParse({ itemIds: [TYPE] }).success).toBe(true)
  })

  it('takes an amount instead of a percent', () => {
    const amount = code({ kind: 'amount', percent: undefined, amountMinor: 2000, usageLimit: 5 })

    expect(createDiscountCodeSchema.parse(amount)).toMatchObject({
      kind: 'amount',
      amountMinor: 2000,
      usageLimit: 5,
    })
  })
})

describe('a change of a discount code', () => {
  it('takes any of its terms, and ends it or lets it run again', () => {
    expect(updateDiscountCodeSchema.parse({ usageLimit: 10, ended: true })).toEqual({
      usageLimit: 10,
      ended: true,
    })
    expect(updateDiscountCodeSchema.parse({ code: 'LATE-5' })).toEqual({ code: 'late-5' })
    expect(updateDiscountCodeSchema.safeParse({ percent: 0 }).success).toBe(false)
    expect(updateDiscountCodeSchema.safeParse({ uses: 0 }).success).toBe(false)
  })
})
