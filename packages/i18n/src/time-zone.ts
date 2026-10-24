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

const wallTimeParts = (value: Date, timeZone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>

/**
 * The wall-clock time of `value` in `timeZone`, as `YYYY-MM-DDTHH:mm`: the value of an
 * `<input type="datetime-local">` that edits a tenant's dates in the tenant's zone (PLAN.md 6).
 */
export function toZonedWallTime(value: Date, timeZone: string) {
  const p = wallTimeParts(value, timeZone)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** Minutes the wall clock of `timeZone` is ahead of UTC at the instant `epochMs`. */
function offsetMinutes(epochMs: number, timeZone: string) {
  const [, y, mo, d, h, mi] = WALL_TIME.exec(toZonedWallTime(new Date(epochMs), timeZone))!
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
  return Math.round((wall - Math.floor(epochMs / 60_000) * 60_000) / 60_000)
}

/**
 * The instant a wall-clock time `YYYY-MM-DDTHH:mm` names in `timeZone`, or `null` for any other
 * string. A time the zone skips when its clocks go forward lands just after the gap; a time it
 * passes twice when they go back is the second one.
 */
export function fromZonedWallTime(value: string, timeZone: string): Date | null {
  const match = WALL_TIME.exec(value)
  if (!match) return null
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number]
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  if (Number.isNaN(asUtc)) return null
  const first = asUtc - offsetMinutes(asUtc, timeZone) * 60_000
  const second = asUtc - offsetMinutes(first, timeZone) * 60_000
  return new Date(second)
}
