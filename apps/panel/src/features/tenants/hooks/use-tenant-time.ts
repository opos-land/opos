import { useLingui } from '@lingui/react'
import { formatDateTime, fromZonedWallTime, isLocale, toZonedWallTime } from '@opos/i18n'
import { useCurrentTenant } from '../components/tenant-context'

/**
 * Dates of the tenant, always in the tenant's time zone, never the browser's (PLAN.md 6): shown
 * in the interface language, and edited as the wall-clock time of that zone.
 */
export function useTenantTime() {
  const { i18n } = useLingui()
  const { tenant } = useCurrentTenant()
  const locale = isLocale(i18n.locale) ? i18n.locale : 'en'
  const timeZone = tenant.timezone

  return {
    timeZone,
    format: (iso: string, options?: Intl.DateTimeFormatOptions) =>
      formatDateTime(new Date(iso), locale, timeZone, options),
    /** A span such as an edition's, joined the way the interface language joins one. */
    range: (startIso: string, endIso: string) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone,
      }).formatRange(new Date(startIso), new Date(endIso)),
    toInput: (iso: string) => toZonedWallTime(new Date(iso), timeZone),
    fromInput: (value: string) => fromZonedWallTime(value, timeZone)?.toISOString() ?? null,
  }
}
