import { i18n, type Messages } from '@lingui/core'
import { activateLocale, detectLocale, isLocale, type Locale } from '@opos/i18n'

export { i18n }

/** The portal's compiled catalogs, one import per locale, loaded when the locale changes. */
const catalogs: Record<Locale, () => Promise<{ messages: Messages }>> = {
  en: () => import('../../locales/en.mjs'),
  pl: () => import('../../locales/pl.mjs'),
}

/** Activates `locale` with the portal's messages and the shared ones of @opos/i18n. */
export async function loadLocale(locale: Locale) {
  if (i18n.locale === locale) return
  const { messages } = await catalogs[locale]()
  await activateLocale(i18n, locale, messages)
  document.documentElement.lang = locale
}

/**
 * The interface language (PLAN.md 6): the account's choice, then the browser's languages, then
 * DEFAULT_LOCALE.
 */
export const pickLocale = (account?: string | null): Locale =>
  detectLocale({ account, acceptLanguage: navigator.languages.join(',') })

export const activeLocale = (): Locale => (isLocale(i18n.locale) ? i18n.locale : pickLocale())

/** A language's name in `displayLocale`; in its own language for the language switcher. */
export const languageName = (code: string, displayLocale: string = code) =>
  new Intl.DisplayNames([displayLocale], { type: 'language' }).of(code) ?? code
