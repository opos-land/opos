import { describe, expect, it } from 'vitest'
import { emailsWith, emailsWithout, speakerName } from './speakers'

const speaker = (
  email: string,
  firstName: string | null = null,
  lastName: string | null = null,
) => ({
  id: email,
  email,
  firstName,
  lastName,
})

describe('emailsWith', () => {
  it('adds an address to the list, trimmed and in lowercase', () => {
    expect(emailsWith([speaker('a@x.test')], '  New@X.test ')).toEqual(['a@x.test', 'new@x.test'])
  })

  it('keeps one entry for an address already on the list', () => {
    expect(emailsWith([speaker('a@x.test')], 'A@x.test')).toEqual(['a@x.test'])
  })
})

describe('emailsWithout', () => {
  it('leaves the other addresses', () => {
    expect(emailsWithout([speaker('a@x.test'), speaker('b@x.test')], 'a@x.test')).toEqual([
      'b@x.test',
    ])
  })
})

describe('speakerName', () => {
  it('joins the names it has', () => {
    expect(speakerName(speaker('a@x.test', 'Kasia', 'Mazur'))).toBe('Kasia Mazur')
    expect(speakerName(speaker('a@x.test', 'Kasia'))).toBe('Kasia')
  })

  it('falls back to the address', () => {
    expect(speakerName(speaker('a@x.test'))).toBe('a@x.test')
  })
})
