import { describe, expect, it } from 'vitest'
import { isPlainLine, plainLine } from './text'

describe('plainLine', () => {
  const line = plainLine(10)

  it('trims a line and keeps what a person typed, whatever the script', () => {
    expect(line.parse('  Zoë ')).toBe('Zoë')
    expect(line.parse('Łucja')).toBe('Łucja')
    expect(line.parse('علي')).toBe('علي')
    expect(line.parse('"Lis"')).toBe('"Lis"')
  })

  it('refuses an empty line and one over its length', () => {
    expect(line.safeParse('   ').success).toBe(false)
    expect(line.safeParse('x'.repeat(11)).success).toBe(false)
    expect(line.safeParse('x'.repeat(10)).success).toBe(true)
  })

  // docs/specs/0016-public-profile.md, N7.
  it.each([
    ['a line break', 'Li\nsek'],
    ['a tab', 'Li\tsek'],
    ['a bell', 'Li\u0007sek'],
    ['a delete', 'Li\u007Fsek'],
    ['a right-to-left override', 'Li‮sek'],
    ['a left-to-right embedding', 'Li‪sek'],
    ['a right-to-left mark', 'Li‏sek'],
    ['an Arabic letter mark', 'Li؜sek'],
    ['a directional isolate', 'Li⁧sek'],
  ])('refuses %s', (_name, text) => {
    expect(line.safeParse(text).success).toBe(false)
  })
})

describe('isPlainLine', () => {
  it('passes what a form may hold before it is trimmed, an empty field among it', () => {
    expect(isPlainLine('')).toBe(true)
    expect(isPlainLine(' Anna ')).toBe(true)
  })

  it('refuses a control and a direction character', () => {
    expect(isPlainLine('An\u0007na')).toBe(false)
    expect(isPlainLine('An\u202Ena')).toBe(false)
  })
})
