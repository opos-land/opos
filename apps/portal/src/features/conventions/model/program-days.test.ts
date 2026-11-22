import { setupI18n } from '@lingui/core'
import { type PublicProgramItem } from '@opos/contract'
import { describe, expect, it } from 'vitest'
import { programDays, speakerNames } from './program-days'

type Speaker = PublicProgramItem['speakers'][number]

const i18n = setupI18n({ locale: 'en', messages: { en: {} } })

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

// docs/specs/0016-public-profile.md, N5: a speaker is shown by its public name.
describe('speakerNames', () => {
  const speaker = (name: Partial<Speaker>): Speaker => ({
    firstName: null,
    nickname: null,
    lastName: null,
    nameOrder: 'nickname-middle',
    profileId: null,
    ...name,
  })

  it('joins the public names of every speaker', () => {
    expect(
      speakerNames(i18n, [
        speaker({ firstName: 'Kasia', nickname: 'Mazurek', lastName: 'Mazur' }),
        speaker({ firstName: 'Jan' }),
        speaker({
          firstName: 'Ola',
          nickname: 'Sowa',
          lastName: 'Lis',
          nameOrder: 'nickname-last',
        }),
      ]),
    ).toBe('Kasia “Mazurek” Mazur, Jan, Ola Lis “Sowa”')
  })

  it('names a speaker with no part of a name Anon', () => {
    expect(speakerNames(i18n, [speaker({}), speaker({ nickname: 'Sowa' })])).toBe('Anon, Sowa')
  })

  it('is empty without speakers', () => {
    expect(speakerNames(i18n, [])).toBe('')
  })
})
