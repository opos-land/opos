import { describe, expect, it } from 'vitest'
import {
  createProgramItemSchema,
  MAX_PROGRAM_ITEMS,
  MAX_SPEAKERS,
  putSpeakersSchema,
  updateProgramItemSchema,
} from './program'

const valid = {
  title: 'Opening ceremony',
  startsAt: '2027-06-01T09:00:00Z',
  endsAt: '2027-06-01T10:00:00Z',
}

const refused = (result: { success: boolean }) => expect(result.success).toBe(false)

describe('MAX_PROGRAM_ITEMS', () => {
  it('bounds what the public programme of an edition can return', () => {
    expect(MAX_PROGRAM_ITEMS).toBe(1000)
  })
})

describe('createProgramItemSchema', () => {
  it('takes a title, a start and an end, and trims the title', () => {
    const parsed = createProgramItemSchema.parse({ ...valid, title: '  Panel  ' })

    expect(parsed.title).toBe('Panel')
  })

  it.each([
    ['a title below 3 characters', { title: 'ab' }],
    ['a title above 200 characters', { title: 'x'.repeat(201) }],
    ['a description above 5000 characters', { description: 'x'.repeat(5001) }],
    ['an end equal to the start', { endsAt: valid.startsAt }],
    ['an end before the start', { endsAt: '2027-06-01T08:00:00Z' }],
    ['an unknown field', { room: 'A' }],
  ])('refuses %s', (_, body) => {
    refused(createProgramItemSchema.safeParse({ ...valid, ...body }))
  })

  it('needs every required field', () => {
    for (const field of ['title', 'startsAt', 'endsAt']) {
      const rest = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field))
      refused(createProgramItemSchema.safeParse(rest))
    }
  })
})

describe('updateProgramItemSchema', () => {
  it('takes any one field, and null as a description', () => {
    expect(updateProgramItemSchema.parse({ title: 'Renamed' })).toEqual({ title: 'Renamed' })
    expect(updateProgramItemSchema.parse({ description: null })).toEqual({ description: null })
    expect(updateProgramItemSchema.parse({})).toEqual({})
  })

  it('compares the dates only when both are sent', () => {
    expect(updateProgramItemSchema.safeParse({ endsAt: valid.startsAt }).success).toBe(true)
    refused(updateProgramItemSchema.safeParse({ startsAt: valid.endsAt, endsAt: valid.startsAt }))
  })

  it('refuses a null title and an unknown field', () => {
    refused(updateProgramItemSchema.safeParse({ title: null }))
    refused(updateProgramItemSchema.safeParse({ room: 'A' }))
  })
})

describe('putSpeakersSchema', () => {
  const addresses = (count: number) =>
    Array.from({ length: count }, (_, index) => `speaker-${index}@example.test`)

  it('takes no speakers and up to the limit', () => {
    expect(putSpeakersSchema.safeParse({ emails: [] }).success).toBe(true)
    expect(putSpeakersSchema.safeParse({ emails: addresses(MAX_SPEAKERS) }).success).toBe(true)
  })

  it('refuses more than the limit, a non-address and an unknown field', () => {
    refused(putSpeakersSchema.safeParse({ emails: addresses(MAX_SPEAKERS + 1) }))
    refused(putSpeakersSchema.safeParse({ emails: ['not-an-address'] }))
    refused(putSpeakersSchema.safeParse({ emails: [], extra: true }))
  })
})
