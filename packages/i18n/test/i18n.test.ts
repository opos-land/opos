import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import {
  activateLocale,
  detectLocale,
  formatDateTime,
  formatMoney,
  parseAcceptLanguage,
} from '../src'
import { errorMessage, unknownError } from '../src/errors'
import { glossary } from '../src/glossary'

describe('locale detection', () => {
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

describe('catalogs', () => {
  it('renders the glossary in Polish', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(i18n._(glossary.ticket)).toBe('akredytacja')
    expect(i18n._(glossary.ticketType)).toBe('rodzaj akredytacji')
    expect(i18n._(glossary.tenant)).toBe('konwent')
  })

  it('keeps the English source text in en', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'en')

    expect(i18n._(glossary.ticket)).toBe('ticket')
  })

  it('lets an application catalog add its own messages', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl', { 'app.only': 'Tylko w aplikacji' })

    expect(i18n._('app.only')).toBe('Tylko w aplikacji')
    expect(i18n._(glossary.edition)).toBe('edycja')
  })
})

describe('errors', () => {
  it('maps a known code and falls back for an unknown one', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(i18n._(errorMessage('tenant.slug-taken'))).toBe(
      'Ten adres jest już zajęty przez inny konwent.',
    )
    expect(errorMessage('no.such-code')).toBe(unknownError)
  })
})

describe('formatting', () => {
  it('formats a date in the given time zone', () => {
    const at = new Date('2026-06-01T22:30:00Z')

    expect(formatDateTime(at, 'pl', 'Europe/Warsaw', { hour: '2-digit', minute: '2-digit' })).toBe(
      '00:30',
    )
  })

  it('formats minor units as currency', () => {
    expect(formatMoney(12000, 'PLN', 'pl').replace(/\s/g, ' ')).toBe('120,00 zł')
  })
})
