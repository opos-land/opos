import { describe, expect, it } from 'vitest'
import { conventionBeside } from './listed-edition'

describe('conventionBeside', () => {
  it("names the convention beside an edition whose name does not hold the convention's", () => {
    expect(conventionBeside('Spring edition', 'Convention A')).toBe('Convention A')
    expect(conventionBeside('2027', 'Convention A')).toBe('Convention A')
  })

  it('names nothing beside an edition that already says whose it is', () => {
    expect(conventionBeside('Convention A 2027', 'Convention A')).toBeNull()
    expect(conventionBeside('The 12th CONVENTION A', 'Convention A')).toBeNull()
  })

  it('compares the names without regard to case, spaces around them and accents of case', () => {
    expect(conventionBeside('ŻUBROKON 2027', ' Żubrokon ')).toBeNull()
  })
})
