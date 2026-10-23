/** Whether `Intl` knows the IANA time zone; tenants format programme times in it (PLAN.md 6). */
export function isTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}
