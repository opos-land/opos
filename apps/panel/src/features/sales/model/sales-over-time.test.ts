import { describe, expect, it } from 'vitest'
import { salesOverTime } from './sales-over-time'

const sold = (day: string, paidMinor: number, manualMinor: number, tickets: number) => ({
  day,
  paidMinor,
  manualMinor,
  tickets,
})

describe('salesOverTime', () => {
  it('is empty while nothing was sold', () => {
    expect(salesOverTime([], '2027-03-10')).toEqual([])
  })

  it('starts from nothing on the day before the first sale', () => {
    const [first, second] = salesOverTime([sold('2027-03-02', 25000, 0, 2)], '2027-03-02')

    expect(first).toEqual({
      day: '2027-03-01',
      revenueMinor: 0,
      tickets: 0,
      revenueSoFarMinor: 0,
      ticketsSoFar: 0,
    })
    expect(second).toEqual({
      day: '2027-03-02',
      revenueMinor: 25000,
      tickets: 2,
      revenueSoFarMinor: 25000,
      ticketsSoFar: 2,
    })
  })

  it('adds what each day sold, in the shop and by hand, to what was sold so far', () => {
    const days = salesOverTime(
      [sold('2027-03-02', 25000, 0, 2), sold('2027-03-04', 3000, 7000, 1)],
      '2027-03-04',
    )

    expect(days.map((day) => [day.day, day.revenueMinor, day.revenueSoFarMinor])).toEqual([
      ['2027-03-01', 0, 0],
      ['2027-03-02', 25000, 25000],
      ['2027-03-03', 0, 25000],
      ['2027-03-04', 10000, 35000],
    ])
    expect(days.map((day) => [day.tickets, day.ticketsSoFar])).toEqual([
      [0, 0],
      [2, 2],
      [0, 2],
      [1, 3],
    ])
  })

  it('goes on to today, so the days since the last sale show that nothing sold', () => {
    const days = salesOverTime([sold('2027-03-02', 25000, 0, 2)], '2027-03-05')

    expect(days.map((day) => day.day)).toEqual([
      '2027-03-01',
      '2027-03-02',
      '2027-03-03',
      '2027-03-04',
      '2027-03-05',
    ])
    expect(days.at(-1)).toMatchObject({ revenueMinor: 0, revenueSoFarMinor: 25000 })
  })

  it('ends on the last sale when today is before it', () => {
    const days = salesOverTime([sold('2027-03-02', 25000, 0, 2)], '2027-02-20')

    expect(days.map((day) => day.day)).toEqual(['2027-03-01', '2027-03-02'])
  })

  it('walks the calendar across a month, a leap day and a year', () => {
    expect(
      salesOverTime([sold('2028-02-28', 100, 0, 1)], '2028-03-01').map((day) => day.day),
    ).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01'])
    expect(
      salesOverTime([sold('2028-01-01', 100, 0, 1)], '2028-01-01').map((day) => day.day),
    ).toEqual(['2027-12-31', '2028-01-01'])
  })
})
