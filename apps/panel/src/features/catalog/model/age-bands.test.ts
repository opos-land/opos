import { describe, expect, it } from 'vitest'
import { ageBandsBody } from './age-bands'

describe('the ages that divide the age bands', () => {
  it('are two whole numbers, the second above the first', () => {
    expect(ageBandsBody('13', ' 18 ')).toEqual({ ageBands: { teenFromAge: 13, adultFromAge: 18 } })
  })

  it('are none while both fields are empty', () => {
    expect(ageBandsBody('', ' ')).toEqual({ ageBands: null })
  })

  it.each([
    ['one age without the other', '13', ''],
    ['the other age without the one', '', '18'],
    ['an adult no older than a teen', '18', '18'],
    ['a teen from birth', '0', '18'],
    ['an age that is no whole number', '12.5', '18'],
    ['an age past any person', '13', '151'],
    ['words', 'thirteen', 'eighteen'],
  ])('are refused as %s', (_, teen, adult) => {
    expect(ageBandsBody(teen, adult)).toBeNull()
  })
})
