import { describe, expect, it } from 'vitest'
import { totp } from './totp'

// RFC 6238 appendix B, SHA-1: the secret is the ASCII string 12345678901234567890.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('totp', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('matches the RFC 6238 vector at %i seconds', (seconds, expected) => {
    expect(totp(SECRET, seconds * 1000, 8)).toBe(expected)
  })

  it('gives six digits by default, keeping leading zeros', () => {
    expect(totp(SECRET, 1111111109 * 1000)).toBe('081804')
  })

  it('reads the secret case-insensitively and without padding', () => {
    expect(totp(SECRET.toLowerCase(), 59_000, 8)).toBe('94287082')
    expect(totp(`${SECRET}====`, 59_000, 8)).toBe('94287082')
  })

  it('rejects a character outside base32', () => {
    expect(() => totp('GEZD1', 0)).toThrow(/base32/)
  })
})
