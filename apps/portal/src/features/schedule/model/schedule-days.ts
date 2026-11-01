import { toZonedWallTime } from '@opos/i18n'

/**
 * Items grouped by their day, each counted in the zone of its own convention. The items come by
 * instant, which across zones is not the order of their days, so the days are sorted here and each
 * appears once; inside a day the items keep their order.
 */
export function scheduleDays<T extends { startsAt: string; tenant: { timezone: string } }>(
  items: T[],
) {
  const days = new Map<string, T[]>()
  for (const item of items) {
    const day = toZonedWallTime(new Date(item.startsAt), item.tenant.timezone).slice(0, 10)
    const group = days.get(day)
    if (group) group.push(item)
    else days.set(day, [item])
  }
  return [...days]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, dayItems]) => ({ day, items: dayItems }))
}
