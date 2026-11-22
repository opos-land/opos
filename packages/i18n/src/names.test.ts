import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import { type NameParts, publicInitials, publicName } from './names'

const parts = (changes: Partial<NameParts>): NameParts => ({
  firstName: null,
  nickname: null,
  lastName: null,
  nameOrder: 'nickname-middle',
  ...changes,
})

const all = { firstName: 'Anna', nickname: 'Lisek', lastName: 'Nowak' }

async function inLocale(locale: 'en' | 'pl') {
  const i18n = setupI18n()
  await activateLocale(i18n, locale)
  return i18n
}

// docs/specs/0016-public-profile.md, N1-N4.
describe('publicName', () => {
  it('puts the nickname between the names or after them, as the account chose', async () => {
    const en = await inLocale('en')

    expect(publicName(en, parts(all))).toBe('Anna “Lisek” Nowak')
    expect(publicName(en, parts({ ...all, nameOrder: 'nickname-last' }))).toBe('Anna Nowak “Lisek”')
  })

  it('quotes the nickname as the reader’s language does', async () => {
    expect(publicName(await inLocale('pl'), parts(all))).toBe('Anna „Lisek” Nowak')
  })

  it.each([
    [{ firstName: 'Anna', lastName: 'Nowak' }, 'Anna Nowak'],
    [{ firstName: 'Anna' }, 'Anna'],
    [{ lastName: 'Nowak' }, 'Nowak'],
    [{ firstName: 'Anna', nickname: 'Lisek' }, 'Anna “Lisek”'],
    [{ nickname: 'Lisek', lastName: 'Nowak' }, '“Lisek” Nowak'],
    [
      { nickname: 'Lisek', lastName: 'Nowak', nameOrder: 'nickname-last' as const },
      'Nowak “Lisek”',
    ],
  ])('shows the parts %o that are there as %s', async (some, name) => {
    expect(publicName(await inLocale('en'), parts(some))).toBe(name)
  })

  it('shows a nickname that stands alone without quotation marks', async () => {
    expect(publicName(await inLocale('en'), parts({ nickname: 'Lisek' }))).toBe('Lisek')
    expect(publicName(await inLocale('pl'), parts({ nickname: 'Lisek' }))).toBe('Lisek')
  })

  it('shows an account with no part of a name as Anon', async () => {
    expect(publicName(await inLocale('en'), parts({}))).toBe('Anon')
    expect(publicName(await inLocale('pl'), parts({}))).toBe('Anon')
  })

  it('takes a part that holds only spaces as missing', async () => {
    expect(publicName(await inLocale('en'), parts({ firstName: '  ', nickname: ' ' }))).toBe('Anon')
  })
})

// docs/specs/0016-public-profile.md, A5.
describe('publicInitials', () => {
  it.each([
    [{ firstName: 'anna', lastName: 'nowak' }, 'AN'],
    [{ firstName: 'Anna', nickname: 'Lisek', lastName: 'Nowak' }, 'AN'],
    [{ firstName: 'Anna' }, 'A'],
    [{ lastName: 'Łoś' }, 'Ł'],
    [{ nickname: 'lisek' }, 'L'],
    [{ firstName: 'Anna', nickname: 'Lisek' }, 'A'],
    [{}, 'A'],
  ])('takes the initials of %o as %s', async (some, initials) => {
    expect(publicInitials(await inLocale('en'), parts(some))).toBe(initials)
  })

  it('keeps a letter of two code units whole', async () => {
    expect(publicInitials(await inLocale('en'), parts({ firstName: '𝒜da' }))).toBe('𝒜')
  })
})
