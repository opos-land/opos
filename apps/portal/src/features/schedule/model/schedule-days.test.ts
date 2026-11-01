import { describe, expect, it } from 'vitest'
import { scheduleDays } from './schedule-days'

const item = (id: string, startsAt: string, timezone: string) => ({
  id,
  startsAt,
  tenant: { timezone },
})

describe('scheduleDays', () => {
  it('groups items by their day, in their order', () => {
    const items = [
      item('a', '2027-06-01T08:00:00Z', 'Europe/Warsaw'),
      item('b', '2027-06-01T10:00:00Z', 'Europe/Warsaw'),
      item('c', '2027-06-02T08:00:00Z', 'Europe/Warsaw'),
    ]

    expect(scheduleDays(items).map((day) => day.items.map(({ id }) => id))).toEqual([
      ['a', 'b'],
      ['c'],
    ])
  })

  it('counts the day of each item in the zone of its own convention', () => {
    const lateInWarsaw = item('a', '2027-06-01T22:30:00Z', 'Europe/Warsaw')
    const sameInstantInNewYork = item('b', '2027-06-01T22:30:00Z', 'America/New_York')

    expect(scheduleDays([sameInstantInNewYork, lateInWarsaw]).map(({ day }) => day)).toEqual([
      '2027-06-01',
      '2027-06-02',
    ])
  })

  // By instant, a late item in Warsaw can sit between two items of another zone's earlier day.
  it('keeps each day once and in order when zones interleave', () => {
    const items = [
      item('warsaw-first', '2027-06-04T22:30:00Z', 'Europe/Warsaw'),
      item('new-york', '2027-06-04T23:00:00Z', 'America/New_York'),
      item('warsaw-second', '2027-06-04T23:30:00Z', 'Europe/Warsaw'),
    ]

    expect(
      scheduleDays(items).map(({ day, items: dayItems }) => [day, dayItems.map(({ id }) => id)]),
    ).toEqual([
      ['2027-06-04', ['new-york']],
      ['2027-06-05', ['warsaw-first', 'warsaw-second']],
    ])
  })

  it('has no days without items', () => {
    expect(scheduleDays([])).toEqual([])
  })
})
