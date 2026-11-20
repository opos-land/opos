import { fromZonedWallTime, toZonedWallTime } from '@opos/i18n'

const pad = (value: number) => String(value).padStart(2, '0')

/** The calendar day `days` after the one of `day`, both as `YYYY-MM-DD`. */
const shifted = (day: string, days: number) => {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const moved = new Date(Date.UTC(year, month - 1, date + days))
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`
}

/**
 * When an edition's reminder goes out (docs/specs/0011-pre-edition-reminder.md, R1, R2, R8): from
 * 9:00 by the clock of the convention's time zone, so many days before the edition's first day
 * in that zone, until that day ends. A reminder missed on its day is not sent late.
 */
export function reminderWindow(
  startsAt: Date,
  daysBefore: number,
  timeZone: string,
): { from: Date; until: Date } {
  const firstDay = toZonedWallTime(startsAt, timeZone).slice(0, 10)
  const day = shifted(firstDay, -daysBefore)
  const at = (wallTime: string) => {
    const moment = fromZonedWallTime(wallTime, timeZone)
    if (!moment) throw new Error(`No such moment in ${timeZone}: ${wallTime}`)
    return moment
  }
  return { from: at(`${day}T09:00`), until: at(`${shifted(day, 1)}T00:00`) }
}
