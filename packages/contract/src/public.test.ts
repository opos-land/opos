import { describe, expect, it } from 'vitest'
import { logoSchema } from './branding'
import {
  EDITION_LIST_PAGE,
  editionListPlace,
  editionListQuerySchema,
  editionListSchema,
  listedEditionSchema,
  MAX_EDITION_LIST_PAGE,
  publicEditionSchema,
  publicProgramItemSchema,
  publicTenantSchema,
} from './public'

// What leaves the API without sign-in: a field added here is public at once.
describe('the public schemas', () => {
  it('give a speaker names alone', () => {
    const speaker = publicProgramItemSchema.shape.speakers.element

    expect(Object.keys(speaker.shape).sort()).toEqual(['firstName', 'lastName'])
  })

  it('drop any other field of a speaker on the way out', () => {
    const item = publicProgramItemSchema.parse({
      id: '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60',
      title: 'Panel',
      description: null,
      startsAt: '2027-06-01T09:00:00Z',
      endsAt: '2027-06-01T10:00:00Z',
      speakers: [{ firstName: 'Kasia', lastName: 'Mazur', email: 'kasia@example.test' }],
      likeCount: 0,
    })

    expect(item.speakers).toEqual([{ firstName: 'Kasia', lastName: 'Mazur' }])
  })

  it('name the fields of a convention and an edition', () => {
    expect(Object.keys(publicTenantSchema.shape).sort()).toEqual([
      'defaultLocale',
      'logo',
      'name',
      'timezone',
    ])
    expect(Object.keys(publicEditionSchema.shape).sort()).toEqual([
      'endsAt',
      'id',
      'isActive',
      'name',
      'slug',
      'startsAt',
      'venueAddress',
      'venueCity',
      'venueName',
    ])
  })

  it('give a logo as its file and the proportions of the picture, and nothing of the file', () => {
    expect(Object.keys(logoSchema.shape).sort()).toEqual(['fileId', 'height', 'width'])
  })

  // The list reads across conventions: what it names of an edition and of its convention is all
  // that a visitor learns of either.
  it('name the fields of a row of the list of editions', () => {
    expect(Object.keys(listedEditionSchema.shape).sort()).toEqual([
      'endsAt',
      'id',
      'name',
      'slug',
      'startsAt',
      'tenant',
      'venueCity',
    ])
    expect(Object.keys(listedEditionSchema.shape.tenant.shape).sort()).toEqual([
      'logo',
      'name',
      'slug',
      'timezone',
    ])
  })
})

describe('the place a page of the list continues from', () => {
  const id = '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60'

  it('is the moment of a row, to the millisecond, and its identifier', () => {
    const place = editionListPlace.write(new Date('2027-06-01T08:00:00.123Z'), id)

    expect(place).toBe(`${Date.parse('2027-06-01T08:00:00.123Z')}_${id}`)
    expect(editionListPlace.read(place)).toEqual({
      moment: new Date('2027-06-01T08:00:00.123Z'),
      id,
    })
  })

  it('reads a moment before 1970 too', () => {
    const moment = new Date('1969-07-20T20:17:00.000Z')

    expect(editionListPlace.read(editionListPlace.write(moment, id))).toEqual({ moment, id })
  })

  it('travels with a page, and is absent after the last one', () => {
    expect(Object.keys(editionListSchema.shape).sort()).toEqual(['editions', 'next'])
    expect(editionListSchema.parse({ editions: [], next: null })).toEqual({
      editions: [],
      next: null,
    })
  })
})

describe('editionListQuerySchema', () => {
  const after = `1811836800000_0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60`

  it('takes a part of the list and reads a page of 20 unless asked otherwise', () => {
    expect(editionListQuerySchema.parse({ period: 'coming' })).toEqual({
      period: 'coming',
      limit: EDITION_LIST_PAGE,
    })
    expect(EDITION_LIST_PAGE).toBe(20)
  })

  it('takes the edition a page continues after and a size as the address carries it', () => {
    expect(editionListQuerySchema.parse({ period: 'past', after, limit: '50' })).toEqual({
      period: 'past',
      after,
      limit: MAX_EDITION_LIST_PAGE,
    })
  })

  it.each([
    ['no part of the list', {}],
    ['a part the list does not have', { period: 'all' }],
    ['a page of none', { period: 'past', limit: 0 }],
    ['a page over the largest', { period: 'past', limit: MAX_EDITION_LIST_PAGE + 1 }],
    ['a place the list never named', { period: 'past', after: 'last' }],
    [
      'an edition alone as the place',
      { period: 'past', after: '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60' },
    ],
    [
      'a moment no date can hold',
      { period: 'past', after: `99999999999999999_0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60` },
    ],
    ['a field of its own', { period: 'past', city: 'Poznań' }],
  ])('refuses %s', (_, query) => {
    expect(editionListQuerySchema.safeParse(query).success).toBe(false)
  })
})
