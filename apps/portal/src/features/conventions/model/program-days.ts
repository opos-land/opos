import { type I18n } from '@lingui/core'
import { type PublicProgramItem } from '@opos/contract'
import { toZonedWallTime } from '@opos/i18n'
import { publicName } from '@opos/i18n/names'

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

/** The public names of an item's speakers, in the reader's language; "Anon" for one with no name. */
export const speakerNames = (i18n: I18n, speakers: PublicProgramItem['speakers']) =>
  speakers.map((speaker) => publicName(i18n, speaker)).join(', ')
