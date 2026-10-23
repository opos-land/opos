import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import { glossary } from './glossary'

describe('activateLocale', () => {
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
