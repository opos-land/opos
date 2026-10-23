import { describe, expect, it } from 'vitest'
import { isTimeZone } from './time-zone'

describe('isTimeZone', () => {
  it.each(['Europe/Warsaw', 'Europe/Prague', 'Asia/Kolkata', 'UTC'])('accepts %s', (zone) => {
    expect(isTimeZone(zone)).toBe(true)
  })

  it.each(['Mars/Olympus', '+01:00', '-05:30', ''])('refuses %s', (zone) => {
    expect(isTimeZone(zone)).toBe(false)
  })
})
