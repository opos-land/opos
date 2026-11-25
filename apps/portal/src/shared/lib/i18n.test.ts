import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  accountLocale,
  activeLocale,
  chooseSignedOutLocale,
  i18n,
  LOCALE_STORAGE_KEY,
  signedOutLocale,
} from './i18n'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

// A browser asking for English, which the interface never follows by itself.
const englishBrowser = () =>
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US', 'en'])

describe('accountLocale', () => {
  it("follows the account's choice", () => {
    expect(accountLocale('en')).toBe('en')
    expect(accountLocale('pl')).toBe('pl')
  })

  it("is Polish for an account with no choice, whatever the browser's language", () => {
    englishBrowser()
    expect(accountLocale(null)).toBe('pl')
    expect(accountLocale('cs')).toBe('pl')
  })
})

describe('signedOutLocale', () => {
  it("is Polish until a language is chosen in this browser, whatever the browser's language", () => {
    englishBrowser()
    expect(signedOutLocale()).toBe('pl')
  })

  it('follows the language chosen in this browser', async () => {
    await chooseSignedOutLocale('en')

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(signedOutLocale()).toBe('en')
    expect(i18n.locale).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('skips a stored value that is no supported language', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'cs')
    expect(signedOutLocale()).toBe('pl')
  })
})

describe('activeLocale', () => {
  it('is the language on screen', async () => {
    await chooseSignedOutLocale('en')
    expect(activeLocale()).toBe('en')
  })
})
