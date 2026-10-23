import { describe, expect, it } from 'vitest'
import { isTimeZone } from './time-zone'

describe('isTimeZone', () => {
  it('accepts IANA zones and refuses anything else', () => {
    expect(isTimeZone('Europe/Warsaw')).toBe(true)
    expect(isTimeZone('Mars/Olympus')).toBe(false)
  })
})
