import { describe, expect, it } from 'vitest'
import { publicEditionSchema, publicProgramItemSchema, publicTenantSchema } from './public'

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
    ])
  })
})
