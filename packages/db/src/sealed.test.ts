import { describe, expect, it } from 'vitest'
import { open, providerAccountOf, seal, sealingKey } from './sealed'

const key = sealingKey('a secret of at least thirty-two characters')
const other = sealingKey('another secret of thirty-two characters!')
// What a sealed value belongs to: it opens for that alone.
const mine = 'a row of mine'

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
    const sealed = seal(key, '{"crc":"żółć"}', mine)

    expect(open(key, sealed, mine)).toBe('{"crc":"żółć"}')
  })

  it('seals the same text differently each time, and never shows it', () => {
    const [first, second] = [seal(key, 'secret-value', mine), seal(key, 'secret-value', mine)]

    expect(first).not.toBe(second)
    expect(first).not.toContain('secret-value')
    expect(first).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it('refuses another key', () => {
    expect(() => open(other, seal(key, 'secret-value', mine), mine)).toThrow(/could not be opened/)
  })

  it('refuses a value changed since it was sealed', () => {
    const [version, iv, text, tag] = seal(key, 'secret-value', mine).split('.')
    const changed = Buffer.from(text!, 'base64url')
    changed[0] = changed[0]! ^ 1

    expect(() =>
      open(key, [version, iv, changed.toString('base64url'), tag].join('.'), mine),
    ).toThrow(/could not be opened/)
  })

  // A sealed value copied into another row, by someone who writes the database and holds no key,
  // opens nothing there.
  it('opens only for what it was sealed for', () => {
    const sealed = seal(key, 'secret-value', mine)

    expect(() => open(key, sealed, 'a row of yours')).toThrow(/could not be opened/)
    expect(() => open(key, sealed, '')).toThrow(/could not be opened/)
    expect(open(key, sealed, mine)).toBe('secret-value')
  })

  it('names a provider account by its tenant and its provider', () => {
    const a = providerAccountOf('0198c1a0-0000-7000-8000-00000000000a', 'fake')

    expect(a).not.toBe(providerAccountOf('0198c1a0-0000-7000-8000-00000000000b', 'fake'))
    expect(a).not.toBe(providerAccountOf('0198c1a0-0000-7000-8000-00000000000a', 'przelewy24'))
    expect(() => open(key, seal(key, 'secret-value', a), a)).not.toThrow()
  })

  it.each(['', 'plain text', 'v2.a.b.c', 'v1.a.b'])(
    'refuses %j, which it never sealed',
    (value) => {
      expect(() => open(key, value, mine)).toThrow(/could not be opened/)
    },
  )
})
