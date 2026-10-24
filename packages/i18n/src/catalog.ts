import type { I18n, Messages } from '@lingui/core'
import type { Locale } from './locales'

/**
 * The shared catalogs compiled by `pnpm i18n:compile`, one import per locale. A bundler copies
 * only the files an import names, so a path built from a variable would leave them behind.
 */
const catalogs: Record<Locale, () => Promise<{ messages: Messages }>> = {
  en: () => import('../locales/en.mjs'),
  pl: () => import('../locales/pl.mjs'),
}

/** Activates a locale with the shared messages of this package merged with the caller's own. */
export async function activateLocale(i18n: I18n, locale: Locale, appMessages: Messages = {}) {
  const { messages } = await catalogs[locale]()
  i18n.loadAndActivate({ locale, messages: { ...messages, ...appMessages } })
}
