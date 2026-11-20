import { Trans, useLingui } from '@lingui/react/macro'
import { type Sales } from '@opos/contract'
import { type ReactNode, useId } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { type SalesDay, salesOverTime } from '../model/sales-over-time'

// One series a chart, in the grey of the chart tokens that stands out from the card in each theme.
const CHART = {
  soFar: { theme: { light: 'var(--chart-3)', dark: 'var(--chart-1)' } },
} satisfies ChartConfig

type Measure = 'revenue' | 'tickets'
const SO_FAR = { revenue: 'revenueSoFarMinor', tickets: 'ticketsSoFar' } as const
const THAT_DAY = { revenue: 'revenueMinor', tickets: 'tickets' } as const

/** What the pointer is over: the day, what was sold up to it and what was sold on it. */
function DayTooltip({
  active,
  payload,
  measure,
  date,
  value,
}: {
  active?: boolean
  payload?: readonly { payload?: SalesDay }[]
  measure: Measure
  date: (day: string) => string
  value: (amount: number) => string
}) {
  const day = payload?.[0]?.payload
  if (!active || !day) return null
  return (
    <div className="border-border/50 bg-background grid min-w-36 gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{date(day.day)}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">
          <Trans context="sales, up to a day">So far</Trans>
        </dt>
        <dd className="text-right font-medium tabular-nums">{value(day[SO_FAR[measure]])}</dd>
        <dt className="text-muted-foreground">
          <Trans context="sales, on a day">That day</Trans>
        </dt>
        <dd className="text-right font-medium tabular-nums">{value(day[THAT_DAY[measure]])}</dd>
      </dl>
    </div>
  )
}

/** One measure of the sales as it grew over the days, drawn as an area. */
function SoFarChart({
  title,
  days,
  measure,
  date,
  tick,
  value,
  axis,
}: {
  title: ReactNode
  days: SalesDay[]
  measure: Measure
  date: (day: string) => string
  /** A day as the axis writes it: short, with no year. */
  tick: (day: string) => string
  value: (amount: number) => string
  /** An amount as the axis writes it. */
  axis: (amount: number) => string
}) {
  const titleId = useId()
  return (
    <figure aria-labelledby={titleId} className="flex min-w-0 flex-col gap-2">
      <figcaption id={titleId} className="text-sm font-medium">
        {title}
      </figcaption>
      <ChartContainer config={CHART} className="aspect-auto h-56 w-full">
        <AreaChart accessibilityLayer data={days} margin={{ top: 8, right: 12, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            tickFormatter={tick}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={64}
            allowDecimals={false}
            tickFormatter={axis}
          />
          <ChartTooltip content={<DayTooltip measure={measure} date={date} value={value} />} />
          <Area
            dataKey={SO_FAR[measure]}
            type="monotone"
            stroke="var(--color-soFar)"
            strokeWidth={2}
            fill="var(--color-soFar)"
            fillOpacity={0.2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </figure>
  )
}

/**
 * How an edition sold over time (docs/specs/0010-sales-reports.md, D6): the revenue and the
 * tickets sold so far, each as a chart of its own since they share no scale, and under them the
 * days something was sold on as a table, which says the same to a reader no chart reaches.
 */
export function SalesOverTime({
  days,
  today,
  currency,
  money,
  number,
}: {
  days: Sales['days']
  /** Today in the convention's time zone, as `YYYY-MM-DD`: the charts run up to it. */
  today: string
  currency: string
  money: (amountMinor: number) => string
  number: (value: number) => string
}) {
  const { i18n } = useLingui()
  const locale = i18n.locale
  // A day is a calendar date with no zone of its own: written as the same date everywhere.
  const written = (day: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(`${day}T00:00:00Z`),
    )
  const date = (day: string) => written(day, { dateStyle: 'medium' })
  const tick = (day: string) => written(day, { day: 'numeric', month: 'short' })
  // The axis writes an amount short, in whole units of the currency.
  const fraction =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  const short = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  const over = salesOverTime(days, today)

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <SoFarChart
          title={<Trans>Revenue so far</Trans>}
          days={over}
          measure="revenue"
          date={date}
          tick={tick}
          value={money}
          axis={(amountMinor) => short.format(amountMinor / 10 ** fraction)}
        />
        <SoFarChart
          title={<Trans>Tickets sold so far</Trans>}
          days={over}
          measure="tickets"
          date={date}
          tick={tick}
          value={number}
          axis={number}
        />
      </div>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer underline">
          <Trans>The days as a table</Trans>
        </summary>
        <Table className="mt-2">
          <caption className="sr-only">
            <Trans>What was sold on each day</Trans>
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">
                <Trans context="sales">Day</Trans>
              </TableHead>
              <TableHead scope="col" className="text-right">
                <Trans>Paid in the shop</Trans>
              </TableHead>
              <TableHead scope="col" className="text-right">
                <Trans>Recorded by organizers</Trans>
              </TableHead>
              <TableHead scope="col" className="text-right">
                <Trans>Tickets</Trans>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => (
              <TableRow key={day.day}>
                <TableHead scope="row" className="font-normal">
                  {date(day.day)}
                </TableHead>
                <TableCell className="text-right tabular-nums">{money(day.paidMinor)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(day.manualMinor)}</TableCell>
                <TableCell className="text-right tabular-nums">{number(day.tickets)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </>
  )
}
