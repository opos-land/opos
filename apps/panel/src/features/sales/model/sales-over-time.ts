import { type Sales } from '@opos/contract'

/** A day of an edition's sales: what was sold on it, and what was sold up to its end. */
export interface SalesDay {
  /** The calendar day, as `YYYY-MM-DD`. */
  day: string
  revenueMinor: number
  tickets: number
  revenueSoFarMinor: number
  ticketsSoFar: number
}

const DAY = 24 * 60 * 60 * 1000

/** The calendar day `days` after `day`. */
const shifted = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)

/**
 * The sales of an edition day by day (docs/specs/0010-sales-reports.md, D6), for a chart: every
 * day from the one before the first sale, where the sum starts from nothing, to `today` or to the
 * last sale when that is later. A day nothing was sold on holds zeros and the sums of the day
 * before. `sold` holds the days in their order, each once.
 */
export function salesOverTime(sold: Sales['days'], today: string): SalesDay[] {
  const first = sold[0]
  const last = sold.at(-1)
  if (!first || !last) return []

  const byDay = new Map(sold.map((day) => [day.day, day]))
  const until = today > last.day ? today : last.day
  const days: SalesDay[] = []
  let revenueSoFarMinor = 0
  let ticketsSoFar = 0
  for (let day = shifted(first.day, -1); day <= until; day = shifted(day, 1)) {
    const on = byDay.get(day)
    const revenueMinor = on ? on.paidMinor + on.manualMinor : 0
    const tickets = on?.tickets ?? 0
    revenueSoFarMinor += revenueMinor
    ticketsSoFar += tickets
    days.push({ day, revenueMinor, tickets, revenueSoFarMinor, ticketsSoFar })
  }
  return days
}
