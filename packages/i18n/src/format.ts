import type { Locale } from './locales'

/** Dates always carry an explicit time zone: programme times use the tenant's (PLAN.md 6). */
export const formatDateTime = (
  value: Date,
  locale: Locale,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
) => new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(value)

/** An amount in minor units (grosze for PLN) in the given ISO 4217 currency. */
export const formatMoney = (amountMinor: number, currency: string, locale: Locale) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100)
