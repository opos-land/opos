import { interestNames, nameRules, profileRules, reportReasonNames } from '@opos/i18n/profiles'
import { describe, expect, it } from 'vitest'
import {
  PROFILE_INTERESTS,
  PROFILE_REPORT_REASONS,
  profileContentSchema,
  profileLinkSchema,
  TAKEDOWN_REASONS,
} from './profiles'
import { plainText } from './text'

const content = {
  description: null,
  pronouns: null,
  city: null,
  links: [] as string[],
  interests: [] as string[],
}

const control = String.fromCodePoint(7)
const override = String.fromCodePoint(0x202e)

// docs/specs/0016-public-profile.md, P5, R2 and M2: one list, named once in every language.
describe('the lists of a profile', () => {
  it.each(PROFILE_INTERESTS)('names the interest %s', (interest) => {
    expect(interestNames[interest]).toBeDefined()
  })

  it('names no interest the list does not hold', () => {
    expect(Object.keys(interestNames).sort()).toEqual([...PROFILE_INTERESTS].sort())
  })

  it.each(PROFILE_REPORT_REASONS)('names the reason %s of a report', (reason) => {
    expect(reportReasonNames[reason]).toBeDefined()
  })

  it('takes a profile down and clears a name for every reason of a report but another one', () => {
    expect(TAKEDOWN_REASONS).toEqual(PROFILE_REPORT_REASONS.filter((reason) => reason !== 'other'))
    expect(Object.keys(profileRules)).toEqual([...TAKEDOWN_REASONS])
    expect(Object.keys(nameRules)).toEqual([...TAKEDOWN_REASONS])
  })
})

// P2: plain text of several lines.
describe('plainText', () => {
  const text = plainText(20)

  it('keeps the line breaks, whatever a browser wrote them as, and trims the ends', () => {
    expect(text.parse('  One.\r\nTwo.\rThree. \n')).toBe('One.\nTwo.\nThree.')
  })

  it('refuses an empty text, one over its length, and a control or a direction character', () => {
    for (const refused of ['  \n ', 'x'.repeat(21), `a${control}b`, `a${override}b`, 'a\tb']) {
      expect(text.safeParse(refused).success).toBe(false)
    }
    expect(text.safeParse('x'.repeat(20)).success).toBe(true)
  })
})

// P4.
describe('profileLinkSchema', () => {
  it.each([
    'https://example.test',
    'https://example.test/me?tab=1&lang=pl#top',
    'https://xn--bcher-kva.example/',
    `https://example.test/${'x'.repeat(179)}`,
  ])('takes %s', (link) => {
    expect(profileLinkSchema.parse(` ${link} `)).toBe(link)
  })

  it.each([
    ['plain http', 'http://example.test'],
    ['a script', 'javascript:alert(1)'],
    ['a data address', 'data:text/html,<p>hi</p>'],
    ['no scheme', 'example.test/me'],
    ['the scheme alone', 'https://'],
    ['a name and a password', 'https://user:secret@example.test'],
    ['a space', 'https://example.test/a b'],
    ['a line break', 'https://example.test/a\nb'],
    ['a direction character', `https://example.test/${override}gpj.exe`],
    ['more than 200 characters', `https://example.test/${'x'.repeat(181)}`],
  ])('refuses %s', (_name, link) => {
    expect(profileLinkSchema.safeParse(link).success).toBe(false)
  })
})

// P1-P5.
describe('profileContentSchema', () => {
  it('takes a profile that holds nothing, and one that holds everything', () => {
    expect(profileContentSchema.safeParse(content).success).toBe(true)
    expect(
      profileContentSchema.parse({
        description: ' Game master.\r\nSince 2010. ',
        pronouns: ' she/her ',
        city: ' Gdynia ',
        links: ['https://a.test', 'https://b.test', 'https://c.test'],
        interests: ['larp', 'cosplay'],
      }),
    ).toEqual({
      description: 'Game master.\nSince 2010.',
      pronouns: 'she/her',
      city: 'Gdynia',
      links: ['https://a.test', 'https://b.test', 'https://c.test'],
      interests: ['larp', 'cosplay'],
    })
  })

  it.each([
    ['a description over 500 characters', { description: 'x'.repeat(501) }],
    ['an empty description, which is none', { description: ' ' }],
    ['pronouns over 30 characters', { pronouns: 'x'.repeat(31) }],
    ['pronouns of two lines', { pronouns: 'she\nher' }],
    ['a city over 80 characters', { city: 'x'.repeat(81) }],
    ['a city with a direction character', { city: `Gdy${override}nia` }],
    [
      'a fourth link',
      { links: ['https://a.test', 'https://b.test', 'https://c.test', 'https://d.test'] },
    ],
    ['a link twice', { links: ['https://a.test', 'https://a.test'] }],
    ['an interest the platform does not list', { interests: ['knitting'] }],
    ['an interest twice', { interests: ['larp', 'larp'] }],
    ['something a profile does not hold', { yearOfBirth: 1990 }],
  ])('refuses %s', (_name, change) => {
    expect(profileContentSchema.safeParse({ ...content, ...change }).success).toBe(false)
  })
})
