import { describe, expect, it } from 'vitest'
import { programDays, speakerNames } from './program-days'

const at = (startsAt: string) => ({ startsAt })

describe('programDays', () => {
  it('groups items by the day of the convention, in their order', () => {
    const items = [
      at('2027-06-01T08:00:00Z'),
      at('2027-06-01T10:00:00Z'),
      at('2027-06-02T08:00:00Z'),
    ]

    expect(programDays(items, 'Europe/Warsaw')).toEqual([
      { day: '2027-06-01', items: [items[0], items[1]] },
      { day: '2027-06-02', items: [items[2]] },
    ])
  })

  it('counts the day in the zone of the convention, not in UTC', () => {
    const lateAtNight = at('2027-06-01T22:30:00Z')

    expect(programDays([lateAtNight], 'Europe/Warsaw')[0]?.day).toBe('2027-06-02')
    expect(programDays([lateAtNight], 'America/New_York')[0]?.day).toBe('2027-06-01')
  })

  it('has no days without items', () => {
    expect(programDays([], 'Europe/Warsaw')).toEqual([])
  })
})

describe('speakerNames', () => {
  it('joins the names of every speaker', () => {
    expect(
      speakerNames([
        { firstName: 'Kasia', lastName: 'Mazur' },
        { firstName: 'Jan', lastName: null },
      ]),
    ).toBe('Kasia Mazur, Jan')
  })

  it('is empty without speakers', () => {
    expect(speakerNames([])).toBe('')
  })
})
