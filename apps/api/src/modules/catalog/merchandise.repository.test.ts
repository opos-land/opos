import { describe, expect, it } from 'vitest'
import { asKnown } from './merchandise.repository'

describe('asKnown', () => {
  const small = { id: '0d6c0d5e-0000-4000-8000-000000000001', hidden: false }
  const medium = { id: '0d6c0d5e-0000-4000-8000-000000000002', hidden: true }
  const large = { id: '0d6c0d5e-0000-4000-8000-000000000003', hidden: false }

  it('holds for the same variants, each hidden or shown as it was read, in any order', () => {
    expect(asKnown([small, medium], [medium, small])).toBe(true)
    expect(asKnown([], [])).toBe(true)
  })

  it('holds whatever else a variant carries: its stock is no part of what was read', () => {
    const stocked = [{ ...small, valueIds: [], stock: 7 }]

    expect(asKnown(stocked, [small])).toBe(true)
  })

  it.each([
    ['a variant added since', [small, medium, large]],
    ['a variant deleted since', [small]],
    ['a variant hidden since', [{ ...small, hidden: true }, medium]],
    ['a variant shown since', [small, { ...medium, hidden: false }]],
    ['a variant made again under another identifier', [small, { ...medium, id: large.id }]],
  ])('does not hold with %s', (_, current) => {
    expect(asKnown(current, [small, medium])).toBe(false)
  })

  it('does not hold for a reading that names a variant twice', () => {
    expect(asKnown([small, medium], [small, small])).toBe(false)
  })
})
