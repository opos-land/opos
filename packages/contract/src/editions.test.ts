import { describe, expect, it } from 'vitest'
import { createEditionSchema, editionSchema, updateEditionSchema } from './editions'

const valid = {
  slug: '2027',
  name: 'Convention A 2027',
  startsAt: '2027-06-01T09:00:00Z',
  endsAt: '2027-06-03T18:00:00Z',
}

const refused = (result: { success: boolean }) => expect(result.success).toBe(false)

describe('the venue of an edition', () => {
  it('is part of an edition as the panel reads it', () => {
    expect(Object.keys(editionSchema.shape)).toEqual(
      expect.arrayContaining(['venueName', 'venueAddress', 'venueCity']),
    )
  })

  it('is optional when an edition is created, each part on its own', () => {
    expect(createEditionSchema.parse(valid)).toEqual(valid)
    expect(createEditionSchema.parse({ ...valid, venueCity: 'Poznań' })).toEqual({
      ...valid,
      venueCity: 'Poznań',
    })
  })

  it('is trimmed, and a part is cleared with null', () => {
    expect(
      updateEditionSchema.parse({ venueName: '  Congress Hall ', venueAddress: null }),
    ).toEqual({ venueName: 'Congress Hall', venueAddress: null })
  })

  it.each([
    ['an empty name', { venueName: '' }],
    ['a name of spaces alone', { venueName: '   ' }],
    ['a name over 200 characters', { venueName: 'n'.repeat(201) }],
    ['an address over 300 characters', { venueAddress: 'a'.repeat(301) }],
    ['a city over 100 characters', { venueCity: 'c'.repeat(101) }],
    ['a city that is no text', { venueCity: 7 }],
  ])('refuses %s', (_, body) => {
    refused(createEditionSchema.safeParse({ ...valid, ...body }))
    refused(updateEditionSchema.safeParse(body))
  })
})
