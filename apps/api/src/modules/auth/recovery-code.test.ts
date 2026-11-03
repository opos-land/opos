import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  hashRecoveryCode,
  newRecoveryCodes,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recovery-code'

describe('newRecoveryCodes', () => {
  it('makes ten distinct codes of 16 base32 characters', () => {
    const codes = newRecoveryCodes()

    expect(RECOVERY_CODE_COUNT).toBe(10)
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{16}$/)
  })

  it('makes other codes every time', () => {
    expect(newRecoveryCodes()).not.toEqual(newRecoveryCodes())
  })
})

describe('normalizeRecoveryCode', () => {
  it.each([
    ['ABCDEFGHIJKLMNOP', 'ABCDEFGHIJKLMNOP'],
    ['abcd-efgh-ijkl-mnop', 'ABCDEFGHIJKLMNOP'],
    [' abcd efgh ijkl mnop ', 'ABCDEFGHIJKLMNOP'],
    ['ABCD\tEFGH-IJKL\nMNOP', 'ABCDEFGHIJKLMNOP'],
  ])('reads %j as %s', (typed, normal) => {
    expect(normalizeRecoveryCode(typed)).toBe(normal)
  })
})

describe('hashRecoveryCode', () => {
  it('is the SHA-256 of the normalized code, in lowercase hex', () => {
    const expected = createHash('sha256').update('ABCDEFGHIJKLMNOP').digest('hex')

    expect(hashRecoveryCode('abcd-efgh-ijkl-mnop')).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{64}$/)
  })

  it('tells two codes apart', () => {
    expect(hashRecoveryCode('AAAAAAAAAAAAAAAA')).not.toBe(hashRecoveryCode('AAAAAAAAAAAAAAAB'))
  })
})
