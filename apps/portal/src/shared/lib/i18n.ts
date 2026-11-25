import { i18n, type Messages } from '@lingui/core'
import { activateLocale, DEFAULT_LOCALE, isLocale, type Locale } from '@opos/i18n'
import { readStorage, writeStorage } from './storage'

export { i18n }

/** Where this browser keeps the language chosen while no account is signed in. */
export const LOCALE_STORAGE_KEY = 'opos-portal-locale'

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
 * The interface language is the one chosen, else DEFAULT_LOCALE: the browser's own languages are
 * never read (docs/PRODUCT.md, Languages, markets and time zones).
 */
const chosenOrDefault = (choice: string | null | undefined): Locale =>
  isLocale(choice) ? choice : DEFAULT_LOCALE

/** The language of a signed-in account: its choice, else DEFAULT_LOCALE. */
export const accountLocale = chosenOrDefault

/** The language chosen in this browser for the visits with no account signed in, else DEFAULT_LOCALE. */
export const signedOutLocale = (): Locale => chosenOrDefault(readStorage(LOCALE_STORAGE_KEY))

/**
 * Keeps `locale` in this browser for the visits with no account signed in, and shows it. It is
 * the visitor's, not an account's: a signed-in account keeps its language on the account.
 */
export async function chooseSignedOutLocale(locale: Locale) {
  writeStorage(LOCALE_STORAGE_KEY, locale)
  await loadLocale(locale)
}

export const activeLocale = (): Locale => (isLocale(i18n.locale) ? i18n.locale : signedOutLocale())

/** A language's name in `displayLocale`; in its own language for the language switcher. */
export const languageName = (code: string, displayLocale: string = code) =>
  new Intl.DisplayNames([displayLocale], { type: 'language' }).of(code) ?? code
