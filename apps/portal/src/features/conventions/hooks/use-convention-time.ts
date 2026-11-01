import { useLingui } from '@lingui/react'
import { formatDateTime, isLocale } from '@opos/i18n'
import { activeLocale } from '../../../shared/lib/i18n'

/** Dates of a convention, in its time zone and never the browser's (PLAN.md 6). */
export function useConventionTime(timeZone: string) {
  const { i18n } = useLingui()
  const locale = isLocale(i18n.locale) ? i18n.locale : activeLocale()
  const span = (options: Intl.DateTimeFormatOptions, start: string, end: string) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone }).formatRange(
      new Date(start),
      new Date(end),
    )

  return {
    day: (iso: string) => formatDateTime(new Date(iso), locale, timeZone, { dateStyle: 'full' }),
    hours: (start: string, end: string) => span({ timeStyle: 'short' }, start, end),
    /** The full date with the hours, naming each date once. */
    when: (start: string, end: string) =>
      span({ dateStyle: 'full', timeStyle: 'short' }, start, end),
    dates: (start: string, end: string) => span({ dateStyle: 'medium' }, start, end),
  }
}
