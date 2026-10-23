import type { I18n, Messages } from '@lingui/core'
import type { Locale } from './locales'

/**
 * Activates a locale with the shared messages of this package merged with the caller's own
 * catalog. The shared catalogs are compiled by `pnpm i18n:compile`.
 */
export async function activateLocale(i18n: I18n, locale: Locale, appMessages: Messages = {}) {
  const { messages } = (await import(`../locales/${locale}.mjs`)) as { messages: Messages }
  i18n.loadAndActivate({ locale, messages: { ...messages, ...appMessages } })
}
