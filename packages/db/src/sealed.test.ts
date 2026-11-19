import { describe, expect, it } from 'vitest'
import { open, seal, sealingKey } from './sealed'

const key = sealingKey('a secret of at least thirty-two characters')
const other = sealingKey('another secret of thirty-two characters!')

describe('sealingKey', () => {
  it('derives 32 bytes from the secret, the same every time and others from another secret', () => {
    expect(key).toHaveLength(32)
    expect(sealingKey('a secret of at least thirty-two characters')).toEqual(key)
    expect(other).not.toEqual(key)
  })

  it('refuses a secret shorter than 32 characters', () => {
    expect(() => sealingKey('short')).toThrow(/at least 32 characters/)
  })
})

describe('seal and open', () => {
  it('opens what it sealed', () => {
    const sealed = seal(key, '{"crc":"żółć"}')

    expect(open(key, sealed)).toBe('{"crc":"żółć"}')
  })

  it('seals the same text differently each time, and never shows it', () => {
    const [first, second] = [seal(key, 'secret-value'), seal(key, 'secret-value')]

    expect(first).not.toBe(second)
    expect(first).not.toContain('secret-value')
    expect(first).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it('refuses another key', () => {
    expect(() => open(other, seal(key, 'secret-value'))).toThrow(/could not be opened/)
  })

  it('refuses a value changed since it was sealed', () => {
    const [version, iv, text, tag] = seal(key, 'secret-value').split('.')
    const changed = Buffer.from(text!, 'base64url')
    changed[0] = changed[0]! ^ 1

    expect(() => open(key, [version, iv, changed.toString('base64url'), tag].join('.'))).toThrow(
      /could not be opened/,
    )
  })

  it.each(['', 'plain text', 'v2.a.b.c', 'v1.a.b'])(
    'refuses %j, which it never sealed',
    (value) => {
      expect(() => open(key, value)).toThrow(/could not be opened/)
    },
  )
})
