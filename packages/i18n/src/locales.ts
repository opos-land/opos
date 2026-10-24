/** The language messages are written in; a message is its own identifier. */
export const SOURCE_LOCALE = 'en'

/**
 * Interface languages, in BCP 47 form. Adding one means adding its `.po` catalogs, the `.d.mts`
 * next to its compiled catalog and its import in catalog.ts.
 */
export const SUPPORTED_LOCALES = ['en', 'pl'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** The interface language when nothing else decides it (PLAN.md 6). */
export const DEFAULT_LOCALE: Locale = 'pl'

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
