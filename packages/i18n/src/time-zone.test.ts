import { describe, expect, it } from 'vitest'
import { fromZonedWallTime, isTimeZone, toZonedWallTime } from './time-zone'

describe('isTimeZone', () => {
  it.each(['Europe/Warsaw', 'Europe/Prague', 'Asia/Kolkata', 'UTC'])('accepts %s', (zone) => {
    expect(isTimeZone(zone)).toBe(true)
  })

  it.each(['Mars/Olympus', '+01:00', '-05:30', ''])('refuses %s', (zone) => {
    expect(isTimeZone(zone)).toBe(false)
  })
})

describe('toZonedWallTime', () => {
  it('reads the wall clock of the zone, not of the process', () => {
    const at = new Date('2026-06-01T22:30:00Z')

    expect(toZonedWallTime(at, 'Europe/Warsaw')).toBe('2026-06-02T00:30')
    expect(toZonedWallTime(at, 'Europe/London')).toBe('2026-06-01T23:30')
    expect(toZonedWallTime(at, 'UTC')).toBe('2026-06-01T22:30')
  })
})

describe('fromZonedWallTime', () => {
  it('turns a wall-clock time of the zone into the instant', () => {
    expect(fromZonedWallTime('2026-06-02T00:30', 'Europe/Warsaw')?.toISOString()).toBe(
      '2026-06-01T22:30:00.000Z',
    )
    expect(fromZonedWallTime('2026-01-15T10:00', 'Europe/Warsaw')?.toISOString()).toBe(
      '2026-01-15T09:00:00.000Z',
    )
    expect(fromZonedWallTime('2026-01-15T10:00', 'Asia/Kolkata')?.toISOString()).toBe(
      '2026-01-15T04:30:00.000Z',
    )
  })

  it('round-trips with toZonedWallTime', () => {
    const at = new Date('2026-08-20T15:45:00Z')

    expect(fromZonedWallTime(toZonedWallTime(at, 'Europe/Prague'), 'Europe/Prague')).toEqual(at)
  })

  it('moves a time the clocks skip to just after the gap', () => {
    // Warsaw goes from 02:00 to 03:00 on 2026-03-29.
    expect(fromZonedWallTime('2026-03-29T02:30', 'Europe/Warsaw')?.toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    )
  })

  it('takes the second of a time the clocks pass twice', () => {
    // Warsaw goes from 03:00 back to 02:00 on 2026-10-25.
    expect(fromZonedWallTime('2026-10-25T02:30', 'Europe/Warsaw')?.toISOString()).toBe(
      '2026-10-25T01:30:00.000Z',
    )
  })

  it.each(['', '2026-06-02', '2026-06-02T00:30:00', 'tomorrow'])('refuses %j', (value) => {
    expect(fromZonedWallTime(value, 'Europe/Warsaw')).toBeNull()
  })
})
