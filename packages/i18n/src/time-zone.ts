/**
 * Whether `timezone` names an IANA zone; tenants format programme times in it (PLAN.md 6). A fixed
 * offset such as `+01:00` is refused: `Intl` accepts it, but it ignores daylight saving time.
 */
export function isTimeZone(timezone: string) {
  try {
    const resolved = new Intl.DateTimeFormat('en', { timeZone: timezone }).resolvedOptions()
      .timeZone
    return !/^[+-]/.test(resolved)
  } catch {
    return false
  }
}

interface WallTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** The wall clock of `timeZone` at `value`, to the minute, as numbers. */
function wallTime(value: Date, timeZone: string): WallTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(value)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<keyof WallTime, number>
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  }
}

/** The instant of a wall time read as UTC; years 0-99 stay themselves, unlike `Date.UTC`. */
function asUtc({ year, month, day, hour, minute }: WallTime) {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, 0, 0)
  return date.getTime()
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

/**
 * The wall-clock time of `value` in `timeZone`, as `YYYY-MM-DDTHH:mm`: the value of an
 * `<input type="datetime-local">` that edits a tenant's dates in the tenant's zone (PLAN.md 6).
 */
export function toZonedWallTime(value: Date, timeZone: string) {
  const w = wallTime(value, timeZone)
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`
}

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Minutes the wall clock of `timeZone` is ahead of UTC at the instant `epochMs`. */
function offsetMinutes(epochMs: number, timeZone: string) {
  const wall = asUtc(wallTime(new Date(epochMs), timeZone))
  return Math.round((wall - Math.floor(epochMs / MINUTE) * MINUTE) / MINUTE)
}

/**
 * The instant a wall-clock time `YYYY-MM-DDTHH:mm` names in `timeZone`, or `null` for any other
 * string and for a date that does not exist (`2026-02-30`, year `0000`). A time the zone skips when
 * its clocks go forward lands just after the gap, shifted by the gap's length; a time it passes
 * twice when they go back is the second one. Both hold for zones on either side of UTC.
 */
export function fromZonedWallTime(value: string, timeZone: string): Date | null {
  const match = WALL_TIME.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ]
  if (year < 1 || hour > 23 || minute > 59) return null
  const wall = asUtc({ year, month, day, hour, minute })
  const check = new Date(wall)
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null

  // A zone changes its offset at most once within a day: the offsets a day before and a day after
  // are the only ones the wall time can be read with.
  const before = offsetMinutes(wall - DAY, timeZone)
  const after = offsetMinutes(wall + DAY, timeZone)
  const candidates = [...new Set([before, after])]
    .map((offset) => wall - offset * MINUTE)
    .filter((instant) => asUtc(wallTime(new Date(instant), timeZone)) === wall)
  // Passed twice: the later instant. Skipped: the offset from before the gap moves it past the gap.
  return new Date(candidates.length ? Math.max(...candidates) : wall - before * MINUTE)
}
