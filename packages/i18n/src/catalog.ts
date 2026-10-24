import type { I18n, Messages } from '@lingui/core'
import { type Locale, SUPPORTED_LOCALES } from './locales'

/**
 * The shared catalogs compiled by `pnpm i18n:compile`, one import per locale: tsdown, which bundles
 * the API, leaves an import path built from a variable unresolved, and the catalog behind it out.
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

/** Loads the shared catalog of every locale, so a build that lost one fails when it starts. */
export async function loadCatalogs() {
  await Promise.all(SUPPORTED_LOCALES.map((locale) => catalogs[locale]()))
}
