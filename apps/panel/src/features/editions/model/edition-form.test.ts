import { fromZonedWallTime } from '@opos/i18n'
import { describe, expect, it } from 'vitest'
import { editionBody, editionFormSchema } from './edition-form'

const valid = {
  name: 'Convention A 2027',
  slug: '2027',
  startsAt: '2027-05-01T10:00',
  endsAt: '2027-05-03T18:00',
}
const warsaw = (value: string) => fromZonedWallTime(value, 'Europe/Warsaw')?.toISOString() ?? null

describe('editionFormSchema', () => {
  it('accepts an edition that ends after it starts', () => {
    expect(editionFormSchema.safeParse(valid).success).toBe(true)
  })

  it('refuses an end before the start, on the end field', () => {
    const result = editionFormSchema.safeParse({ ...valid, endsAt: '2027-04-30T10:00' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['endsAt'])
  })

  it.each(['', 'Edition 2027', 'a'.repeat(41)])('refuses the slug %j', (slug) => {
    expect(editionFormSchema.safeParse({ ...valid, slug }).success).toBe(false)
  })

  it('refuses an empty name', () => {
    expect(editionFormSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false)
  })
})

describe('editionBody', () => {
  it("sends the dates as instants of the tenant's zone", () => {
    expect(editionBody(valid, warsaw)).toEqual({
      name: 'Convention A 2027',
      slug: '2027',
      startsAt: '2027-05-01T08:00:00.000Z',
      endsAt: '2027-05-03T16:00:00.000Z',
    })
  })

  it('gives up on a date that names no instant', () => {
    expect(editionBody({ ...valid, startsAt: 'soon' }, warsaw)).toBeNull()
  })
})
