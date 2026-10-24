import { DEFAULT_LOCALE } from '@opos/i18n'
import { describe, expect, it } from 'vitest'
import { recipientLocale } from './recipient-locale'

describe('recipientLocale', () => {
  it("prefers the account's own choice", () => {
    expect(recipientLocale({ account: 'en', signUp: 'pl', tenant: 'pl' })).toBe('en')
  })

  it('falls back to the locale sent with the sign-up', () => {
    expect(recipientLocale({ account: null, signUp: 'en', tenant: 'pl' })).toBe('en')
  })

  it("falls back to the inviting tenant's language", () => {
    expect(recipientLocale({ tenant: 'en' })).toBe('en')
  })

  it('skips unsupported values', () => {
    expect(recipientLocale({ account: 'cs', signUp: 42, tenant: 'en' })).toBe('en')
  })

  it('ends with the default locale', () => {
    expect(recipientLocale({})).toBe(DEFAULT_LOCALE)
    expect(recipientLocale({ account: 'de', signUp: { locale: 'en' } })).toBe(DEFAULT_LOCALE)
  })
})
