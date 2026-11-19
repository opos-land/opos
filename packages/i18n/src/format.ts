import type { Locale } from './locales'

/** Dates always carry an explicit time zone: programme times use the tenant's. */
export const formatDateTime = (
  value: Date,
  locale: Locale,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
) => new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(value)

/** An amount in minor units (grosze for PLN) in the given ISO 4217 currency. */
export const formatMoney = (amountMinor: number, currency: string, locale: Locale) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100)

/**
 * The amount a person typed, in minor units: digits with an optional decimal part of one or two
 * digits after a comma or a dot, spaces between the digits aside. Null for anything else, a
 * negative amount and a third decimal among them. The digits are read as they stand, never through
 * a float, so no minor unit is lost.
 */
export function parseMoney(text: string): number | null {
  const match = /^(\d*)(?:[.,](\d{1,2}))?$/.exec(text.replace(/\s/g, ''))
  if (!match || (match[1] === '' && match[2] === undefined)) return null
  const minor = Number(match[1] || '0') * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(minor) ? minor : null
}

/** An amount in minor units as a field holds it: two decimals, no grouping, no currency. */
export const moneyInput = (amountMinor: number, locale: Locale) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(amountMinor / 100)
