import { describe, expect, it } from 'vitest'
import { otherEditions } from './edition-order'

const now = new Date('2027-01-01T00:00:00.000Z')

const edition = (slug: string, startsAt: string, endsAt: string, isActive = false) => ({
  id: slug,
  slug,
  name: slug,
  startsAt,
  endsAt,
  isActive,
  venueName: null,
  venueAddress: null,
  venueCity: null,
})

describe('otherEditions', () => {
  it('leaves the active edition out', () => {
    const editions = [
      edition('active', '2027-06-01T08:00:00.000Z', '2027-06-03T18:00:00.000Z', true),
      edition('next', '2028-06-01T08:00:00.000Z', '2028-06-03T18:00:00.000Z'),
    ]

    expect(otherEditions(editions, now).map((e) => e.slug)).toEqual(['next'])
  })

  it('puts the coming ones first, from the soonest, then the past ones from the last ended', () => {
    const editions = [
      edition('2024', '2024-06-01T08:00:00.000Z', '2024-06-03T18:00:00.000Z'),
      edition('2029', '2029-06-01T08:00:00.000Z', '2029-06-03T18:00:00.000Z'),
      edition('2026', '2026-06-01T08:00:00.000Z', '2026-06-03T18:00:00.000Z'),
      edition('2028', '2028-06-01T08:00:00.000Z', '2028-06-03T18:00:00.000Z'),
    ]

    expect(otherEditions(editions, now).map((e) => e.slug)).toEqual([
      '2028',
      '2029',
      '2026',
      '2024',
    ])
  })

  it('counts an edition under way as coming', () => {
    const editions = [
      edition('later', '2027-06-01T08:00:00.000Z', '2027-06-03T18:00:00.000Z'),
      edition('under-way', '2026-12-30T08:00:00.000Z', '2027-01-02T18:00:00.000Z'),
      edition('ended', '2026-12-01T08:00:00.000Z', '2026-12-03T18:00:00.000Z'),
    ]

    expect(otherEditions(editions, now).map((e) => e.slug)).toEqual(['under-way', 'later', 'ended'])
  })
})
