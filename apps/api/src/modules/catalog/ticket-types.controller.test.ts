import { describe, expect, it } from 'vitest'
import { tiersOverlap as overlapping } from '@opos/contract'

const tier = (startsAt: string, endsAt: string) => ({ amountMinor: 100, startsAt, endsAt })
const january = tier('2027-01-01T00:00:00.000Z', '2027-02-01T00:00:00.000Z')
const february = tier('2027-02-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z')

// The check the routes of a ticket type refuse overlapping tiers by, which the panel runs too
// before it sends them.
describe('the price tiers of a ticket type', () => {
  it('do not overlap when there is none or one, or when each ends where the next starts', () => {
    expect(overlapping([])).toBe(false)
    expect(overlapping([january])).toBe(false)
    expect(overlapping([january, february])).toBe(false)
    expect(overlapping([february, january])).toBe(false)
  })

  it('do not overlap with a gap between them', () => {
    expect(
      overlapping([january, tier('2027-04-01T00:00:00.000Z', '2027-05-01T00:00:00.000Z')]),
    ).toBe(false)
  })

  it.each([
    [
      'one starts a millisecond before the other ends',
      tier('2027-01-31T23:59:59.999Z', '2027-03-01T00:00:00.000Z'),
    ],
    ['one lies inside the other', tier('2027-01-10T00:00:00.000Z', '2027-01-20T00:00:00.000Z')],
    ['one covers the other', tier('2026-12-01T00:00:00.000Z', '2027-06-01T00:00:00.000Z')],
    ['both are the same window', january],
  ])('overlap when %s, in whatever order they come', (_, other) => {
    expect(overlapping([january, other])).toBe(true)
    expect(overlapping([other, january])).toBe(true)
    expect(overlapping([february, other, january])).toBe(true)
  })

  it('compare moments, whatever offset each was written with', () => {
    expect(
      overlapping([january, tier('2027-02-01T01:00:00.000+01:00', '2027-03-01T00:00:00.000Z')]),
    ).toBe(false)
  })
})
