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

  it('writes the year with four digits, as datetime-local expects', () => {
    expect(toZonedWallTime(new Date('0202-01-01T10:00:00Z'), 'UTC')).toBe('0202-01-01T10:00')
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

  it('moves a skipped time past the gap in a zone behind UTC', () => {
    // New York goes from 02:00 to 03:00 on 2026-03-08; 02:30 becomes 03:30 EDT.
    expect(fromZonedWallTime('2026-03-08T02:30', 'America/New_York')?.toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    )
  })

  it('takes the second of a doubled time in a zone behind UTC', () => {
    // New York goes from 02:00 back to 01:00 on 2026-11-01; the second 01:30 is EST.
    expect(fromZonedWallTime('2026-11-01T01:30', 'America/New_York')?.toISOString()).toBe(
      '2026-11-01T06:30:00.000Z',
    )
  })

  it('handles a shift of half an hour', () => {
    // Lord Howe Island goes from 02:00 to 02:30 on 2026-10-04.
    expect(fromZonedWallTime('2026-10-04T02:15', 'Australia/Lord_Howe')?.toISOString()).toBe(
      '2026-10-03T15:45:00.000Z',
    )
  })

  it('keeps an early year as written', () => {
    expect(fromZonedWallTime('0202-01-01T10:00', 'UTC')?.toISOString()).toBe(
      '0202-01-01T10:00:00.000Z',
    )
    expect(fromZonedWallTime('0050-01-01T10:00', 'UTC')?.toISOString()).toBe(
      '0050-01-01T10:00:00.000Z',
    )
  })

  it.each([
    '',
    '2026-06-02',
    '2026-06-02T00:30:00',
    'tomorrow',
    '2026-13-01T10:00',
    '2026-02-29T10:00',
    '2026-04-31T10:00',
    '2026-06-00T10:00',
    '2026-06-02T24:00',
    '2026-06-02T10:60',
    '0000-01-01T10:00',
  ])('refuses %j', (value) => {
    expect(fromZonedWallTime(value, 'Europe/Warsaw')).toBeNull()
  })
})
