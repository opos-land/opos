import { type I18n, type Messages, setupI18n } from '@lingui/core'
import { activateLocale, type Locale, SUPPORTED_LOCALES } from '@opos/i18n'

/** The portal's messages in every language it has, each in an instance of its own. */
export type Translators = Record<Locale, I18n>

/** The portal's compiled catalogs, one import per locale, as the portal itself loads them. */
const catalogs: Record<Locale, () => Promise<{ messages: Messages }>> = {
  en: () => import('../locales/en.mjs'),
  pl: () => import('../locales/pl.mjs'),
}

/**
 * Loads every language at once: a head is written in the language of its page, and the pages of
 * one moment are in several.
 */
export async function loadTranslators(): Promise<Translators> {
  const loaded = await Promise.all(
    SUPPORTED_LOCALES.map(async (locale) => {
      const i18n = setupI18n()
      const { messages } = await catalogs[locale]()
      await activateLocale(i18n, locale, messages)
      return [locale, i18n] as const
    }),
  )
  return Object.fromEntries(loaded) as Translators
}
