import { fromZonedWallTime } from '@opos/i18n'
import { describe, expect, it } from 'vitest'
import { endsAtProblem, programItemBody, programItemFormSchema } from './program-item-form'

const valid = {
  title: 'Opening ceremony',
  description: '',
  startsAt: '2027-05-01T10:00',
  endsAt: '2027-05-01T11:00',
}
const warsaw = (value: string) => fromZonedWallTime(value, 'Europe/Warsaw')?.toISOString() ?? null

describe('programItemFormSchema', () => {
  it('accepts an item that ends after it starts, with no description', () => {
    expect(programItemFormSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['a title below 3 characters', { title: 'ab' }],
    ['a title of spaces around 2 characters', { title: '  ab  ' }],
    ['a title above 200 characters', { title: 'x'.repeat(201) }],
    ['a description above 5000 characters', { description: 'x'.repeat(5001) }],
    ['no start', { startsAt: '' }],
    ['no end', { endsAt: '' }],
    ['an end equal to the start', { endsAt: valid.startsAt }],
  ])('refuses %s', (_, change) => {
    expect(programItemFormSchema.safeParse({ ...valid, ...change }).success).toBe(false)
  })

  it('reports an end before the start on the end field', () => {
    const result = programItemFormSchema.safeParse({ ...valid, endsAt: '2027-05-01T09:00' })

    expect(result.error?.issues[0]?.path).toEqual(['endsAt'])
  })
})

describe('endsAtProblem', () => {
  const issue = (endsAt: string) =>
    programItemFormSchema
      .safeParse({ ...valid, endsAt })
      .error?.issues.find((entry) => entry.path[0] === 'endsAt')?.code

  it('tells an empty end from one out of order', () => {
    expect(endsAtProblem(issue(''))).toBe('missing')
    expect(endsAtProblem(issue('2027-05-01T09:00'))).toBe('order')
  })

  it('reports nothing without an error', () => {
    expect(endsAtProblem(undefined)).toBeNull()
  })
})

describe('programItemBody', () => {
  it("sends the dates as instants of the tenant's zone and the title trimmed", () => {
    expect(programItemBody({ ...valid, title: '  Panel  ' }, warsaw)).toEqual({
      title: 'Panel',
      description: null,
      startsAt: '2027-05-01T08:00:00.000Z',
      endsAt: '2027-05-01T09:00:00.000Z',
    })
  })

  it('sends an empty description as none, so saving clears a stored one', () => {
    expect(programItemBody({ ...valid, description: '   ' }, warsaw)?.description).toBeNull()
    expect(programItemBody({ ...valid, description: 'Text' }, warsaw)?.description).toBe('Text')
  })

  it('gives up on a date that names no instant', () => {
    expect(programItemBody({ ...valid, startsAt: 'soon' }, warsaw)).toBeNull()
  })
})
