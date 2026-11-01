import { type PublicProgramItem } from '@opos/contract'
import { toZonedWallTime } from '@opos/i18n'

/** Items grouped by the day of the convention's zone, keeping their order. */
export function programDays<T extends { startsAt: string }>(items: T[], timeZone: string) {
  const days: { day: string; items: T[] }[] = []
  for (const item of items) {
    const day = toZonedWallTime(new Date(item.startsAt), timeZone).slice(0, 10)
    const last = days.at(-1)
    if (last?.day === day) last.items.push(item)
    else days.push({ day, items: [item] })
  }
  return days
}

export const speakerNames = (speakers: PublicProgramItem['speakers']) =>
  speakers
    .map(({ firstName, lastName }) => [firstName, lastName].filter(Boolean).join(' '))
    .join(', ')
