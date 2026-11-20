import { describe, expect, it } from 'vitest'
import { reminderWindow } from './reminder-window'

// docs/specs/0011-pre-edition-reminder.md, R1, R2 and R8: the reminder goes out so many days
// before the edition's first day, at 9:00 in the convention's time zone, and on that day alone.
describe('the day and the hour of a reminder', () => {
  const at = (iso: string) => new Date(iso)

  it('is 9:00 of the day so many days before the edition’s first day, until that day ends', () => {
    // The edition starts on 4 June in Warsaw, in summer time, two hours ahead of UTC.
    const window = reminderWindow(at('2027-06-04T08:00:00Z'), 3, 'Europe/Warsaw')

    expect(window.from.toISOString()).toBe('2027-06-01T07:00:00.000Z')
    expect(window.until.toISOString()).toBe('2027-06-01T22:00:00.000Z')
  })

  it('counts the first day in the convention’s time zone, not the server’s', () => {
    // 23:30 UTC on 3 June is already 4 June in Warsaw, and still 3 June in New York.
    const starts = at('2027-06-03T23:30:00Z')

    expect(reminderWindow(starts, 1, 'Europe/Warsaw').from.toISOString()).toBe(
      '2027-06-03T07:00:00.000Z',
    )
    expect(reminderWindow(starts, 1, 'America/New_York').from.toISOString()).toBe(
      '2027-06-02T13:00:00.000Z',
    )
  })

  it('keeps 9:00 by the clock across a change of the clocks', () => {
    // The clocks of Warsaw go forward on 28 March 2027: the day before is an hour behind.
    const before = reminderWindow(at('2027-03-30T08:00:00Z'), 3, 'Europe/Warsaw')
    const after = reminderWindow(at('2027-04-01T08:00:00Z'), 3, 'Europe/Warsaw')

    expect(before.from.toISOString()).toBe('2027-03-27T08:00:00.000Z')
    expect(after.from.toISOString()).toBe('2027-03-29T07:00:00.000Z')
    // The day of the change itself is an hour short.
    const onTheDay = reminderWindow(at('2027-03-31T08:00:00Z'), 3, 'Europe/Warsaw')
    expect(onTheDay.from.toISOString()).toBe('2027-03-28T07:00:00.000Z')
    expect(onTheDay.until.toISOString()).toBe('2027-03-28T22:00:00.000Z')
  })
})
