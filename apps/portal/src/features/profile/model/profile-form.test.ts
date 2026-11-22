import { type MyProfile } from '@opos/contract'
import { describe, expect, it } from 'vitest'
import {
  fieldProblem,
  profileFormContent,
  profileFormSchema,
  profileFormValues,
} from './profile-form'

const profile: MyProfile = {
  profileId: null,
  published: false,
  avatar: null,
  takedown: null,
  description: null,
  pronouns: null,
  city: null,
  links: [],
  interests: [],
}

const empty = { description: '', pronouns: '', city: '', links: ['', '', ''], interests: [] }

// docs/specs/0016-public-profile.md, P1-P5.
describe('profileFormValues', () => {
  it('shows a profile that holds nothing as empty fields, with a field for each of the three links', () => {
    expect(profileFormValues(profile)).toEqual(empty)
  })

  it('shows what a profile holds, the links it has first', () => {
    expect(
      profileFormValues({
        ...profile,
        description: 'Game master.',
        pronouns: 'she/her',
        city: 'Gdynia',
        links: ['https://a.test'],
        interests: ['larp'],
      }),
    ).toEqual({
      description: 'Game master.',
      pronouns: 'she/her',
      city: 'Gdynia',
      links: ['https://a.test', '', ''],
      interests: ['larp'],
    })
  })
})

describe('profileFormContent', () => {
  it('sends an emptied field as nothing and leaves out the links that were not filled in', () => {
    expect(profileFormContent(empty)).toEqual({
      description: null,
      pronouns: null,
      city: null,
      links: [],
      interests: [],
    })
    expect(
      profileFormContent({
        description: ' Game master. ',
        pronouns: ' she/her ',
        city: ' Gdynia ',
        links: ['', ' https://b.test ', 'https://a.test'],
        interests: ['larp', 'cosplay'],
      }),
    ).toEqual({
      description: 'Game master.',
      pronouns: 'she/her',
      city: 'Gdynia',
      links: ['https://b.test', 'https://a.test'],
      interests: ['larp', 'cosplay'],
    })
  })
})

describe('profileFormSchema', () => {
  const problemOf = (change: object, field: string, index?: number) => {
    const parsed = profileFormSchema.safeParse({ ...empty, ...change })
    if (parsed.success) return undefined
    const issue = parsed.error.issues.find(
      (found) => found.path[0] === field && (index === undefined || found.path[1] === index),
    )
    return fieldProblem(issue && { type: issue.code })
  }

  it('takes every field empty, and every field at its limit', () => {
    expect(profileFormSchema.safeParse(empty).success).toBe(true)
    expect(
      profileFormSchema.safeParse({
        description: 'x'.repeat(500),
        pronouns: 'x'.repeat(30),
        city: 'x'.repeat(80),
        links: ['https://a.test', 'https://b.test', 'https://c.test'],
        interests: ['larp'],
      }).success,
    ).toBe(true)
  })

  it('tells a field that is too long from one that holds a hidden character', () => {
    expect(problemOf({ description: 'x'.repeat(501) }, 'description')).toBe('too-long')
    expect(problemOf({ pronouns: 'x'.repeat(31) }, 'pronouns')).toBe('too-long')
    expect(problemOf({ city: 'x'.repeat(81) }, 'city')).toBe('too-long')
    expect(problemOf({ city: `Gdy${String.fromCodePoint(0x202e)}nia` }, 'city')).toBe('invalid')
  })

  it('keeps the line breaks of a description and refuses them in a line', () => {
    expect(profileFormSchema.safeParse({ ...empty, description: 'One.\nTwo.' }).success).toBe(true)
    expect(problemOf({ pronouns: 'she\nher' }, 'pronouns')).toBe('invalid')
  })

  it('refuses a link that is not an https address, in the field it was typed in', () => {
    expect(problemOf({ links: ['https://a.test', 'http://b.test', ''] }, 'links', 1)).toBe(
      'invalid',
    )
    expect(problemOf({ links: ['example.test', '', ''] }, 'links', 0)).toBe('invalid')
    expect(problemOf({ links: ['https://a.test', '', ''] }, 'links', 0)).toBeUndefined()
  })
})
