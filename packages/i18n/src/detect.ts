import { DEFAULT_LOCALE, isLocale, type Locale } from './locales'

/** Supported locales in an Accept-Language header, best first. */
export function parseAcceptLanguage(header: string | null | undefined): Locale[] {
  if (!header) return []
  return header
    .split(',')
    .map((part, index) => {
      const [range = '', ...params] = part.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      return {
        language: range.trim().toLowerCase().split('-')[0],
        quality: q ? Number(q.slice(2)) : 1,
        index,
      }
    })
    .filter((entry) => entry.quality > 0 && isLocale(entry.language))
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.language as Locale)
}

/**
 * The first supported locale among the candidates, in order: the account's choice, then the
 * Accept-Language header, then DEFAULT_LOCALE (PLAN.md 6, locale detection).
 */
export function detectLocale(candidates: {
  account?: string | null
  acceptLanguage?: string | null
}): Locale {
  if (isLocale(candidates.account)) return candidates.account
  return parseAcceptLanguage(candidates.acceptLanguage)[0] ?? DEFAULT_LOCALE
}
