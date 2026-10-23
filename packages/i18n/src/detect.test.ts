import { describe, expect, it } from 'vitest'
import { detectLocale, parseAcceptLanguage } from './detect'

describe('detectLocale', () => {
  it('prefers the account locale', () => {
    expect(detectLocale({ account: 'en', acceptLanguage: 'pl' })).toBe('en')
  })

  it('falls back to Accept-Language, best quality first', () => {
    expect(detectLocale({ account: null, acceptLanguage: 'de-DE, en-GB;q=0.8, pl;q=0.9' })).toBe(
      'pl',
    )
    expect(parseAcceptLanguage('cs, en-US;q=0.5, pl;q=0')).toEqual(['en'])
  })

  it('ends at DEFAULT_LOCALE', () => {
    expect(detectLocale({ account: 'cs', acceptLanguage: 'de' })).toBe('pl')
    expect(detectLocale({})).toBe('pl')
  })
})
