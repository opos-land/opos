import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import { interestNames, nameRules, profileRules, reportReasonNames } from './profiles'

const said = async (locale: 'en' | 'pl') => {
  const i18n = setupI18n()
  await activateLocale(i18n, locale)
  return i18n
}

// docs/specs/0016-public-profile.md, P5, R2 and M2.
describe('the names of what a profile holds', () => {
  it('names the twelve interests of the platform list, in each language', async () => {
    const [en, pl] = await Promise.all([said('en'), said('pl')])

    expect(Object.keys(interestNames)).toEqual([
      'tabletop-rpg',
      'larp',
      'board-games',
      'card-games',
      'miniature-wargames',
      'video-games',
      'literature',
      'comics',
      'manga-anime',
      'film-tv',
      'cosplay',
      'crafts',
    ])
    expect(en._(interestNames['tabletop-rpg']!)).toBe('Tabletop role-playing games')
    expect(pl._(interestNames['tabletop-rpg']!)).toBe('Gry fabularne (RPG)')
    for (const name of Object.values(interestNames)) {
      expect(pl._(name)).not.toBe('')
    }
    expect(pl._(interestNames['larp']!)).toBe('LARP')
    expect(pl._(interestNames['crafts']!)).toBe('Rękodzieło')
  })

  it('names the four reasons of a report', async () => {
    const [en, pl] = await Promise.all([said('en'), said('pl')])

    expect(Object.keys(reportReasonNames)).toEqual(['identity', 'offensive', 'spam', 'other'])
    expect(en._(reportReasonNames['identity']!)).toBe('Someone else’s picture or identity')
    expect(pl._(reportReasonNames['identity']!)).toBe('Cudze zdjęcie lub tożsamość')
    expect(pl._(reportReasonNames['other']!)).toBe('Inny powód')
  })

  it('states a rule of the terms behind every reason of a takedown, and none behind another reason', async () => {
    const pl = await said('pl')

    for (const rules of [profileRules, nameRules]) {
      expect(Object.keys(rules)).toEqual(['identity', 'offensive', 'spam'])
      for (const rule of Object.values(rules)) {
        expect(pl._(rule)).toMatch(/regulamin/i)
      }
    }
  })
})
