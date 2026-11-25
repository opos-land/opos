import { describe, expect, it } from 'vitest'
import { changedFrom } from './changes'

describe('what a form sends of what it holds', () => {
  const loaded = {
    open: true,
    deadline: '2027-05-01T22:00:00.000Z',
    merchOnly: false,
    pickUp: null,
    ages: { teen: 13, adult: 18 },
  }

  it('is what differs from what the form was filled with', () => {
    expect(
      changedFrom(loaded, { deadline: null, merchOnly: false, pickUp: 'At the desk.' }),
    ).toEqual({ deadline: null, pickUp: 'At the desk.' })
    expect(changedFrom(loaded, { merchOnly: true })).toEqual({ merchOnly: true })
  })

  it('is nothing of a form left as it was filled', () => {
    expect(
      changedFrom(loaded, { deadline: '2027-05-01T22:00:00.000Z', merchOnly: false, pickUp: null }),
    ).toEqual({})
  })

  it('compares a value that holds others by what it holds', () => {
    expect(changedFrom(loaded, { ages: { adult: 18, teen: 13 } })).toEqual({})
    expect(changedFrom(loaded, { ages: { teen: 12, adult: 18 } })).toEqual({
      ages: { teen: 12, adult: 18 },
    })
    expect(changedFrom(loaded, { ages: null })).toEqual({ ages: null })
    expect(changedFrom({ ...loaded, ages: null }, { ages: { teen: 13, adult: 18 } })).toEqual({
      ages: { teen: 13, adult: 18 },
    })
  })
})
