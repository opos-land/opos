// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatTitle, joinTitle } from './title'

describe('joinTitle', () => {
  it('joins the parts into one line, most specific first', () => {
    expect(joinTitle(['Programme', 'Convention A 2026'])).toBe('Programme · Convention A 2026')
  })

  it('leaves out the parts that are missing or blank', () => {
    expect(joinTitle([undefined, ' ', 'Convention A', ''])).toBe('Convention A')
  })

  it('is empty without parts', () => {
    expect(joinTitle([])).toBe('')
  })
})

describe('formatTitle', () => {
  it('ends with the application, with no module of the browser loaded', () => {
    expect(formatTitle(['Programme'], 'OPOS')).toBe('Programme · OPOS')
    expect(formatTitle([], 'OPOS')).toBe('OPOS')
  })
})
