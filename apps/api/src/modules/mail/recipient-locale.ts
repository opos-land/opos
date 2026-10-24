import { DEFAULT_LOCALE, isLocale, type Locale } from '@opos/i18n'

/**
 * The language of an email (PLAN.md 6, locale detection): the recipient's `accounts.locale`, then
 * the locale sent with the sign-up, then, for an address without an account, the inviting tenant's
 * `defaultLocale`, then DEFAULT_LOCALE. An unsupported value is skipped.
 */
export function recipientLocale(candidates: {
  account?: string | null
  signUp?: unknown
  tenant?: string | null
}): Locale {
  for (const candidate of [candidates.account, candidates.signUp, candidates.tenant]) {
    if (isLocale(candidate)) return candidate
  }
  return DEFAULT_LOCALE
}
