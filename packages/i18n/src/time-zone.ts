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
