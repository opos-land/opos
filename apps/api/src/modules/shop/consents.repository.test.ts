import { describe, expect, it } from 'vitest'
import { moved } from './consents.repository'

describe('moving a consent', () => {
  const order = ['a', 'b', 'c', 'd']

  it.each([
    ['to the first place', 'c', 1, ['c', 'a', 'b', 'd']],
    ['up the list', 'd', 2, ['a', 'd', 'b', 'c']],
    ['down the list', 'a', 3, ['b', 'c', 'a', 'd']],
    ['to the last place', 'b', 4, ['a', 'c', 'd', 'b']],
    ['to the place it holds', 'b', 2, ['a', 'b', 'c', 'd']],
  ])('puts it %s, the others keeping their order', (_, id, place, expected) => {
    expect(moved(order, id, place)).toEqual(expected)
  })

  it('takes a place past the end as the last one, and one before the first as the first', () => {
    expect(moved(order, 'a', 99)).toEqual(['b', 'c', 'd', 'a'])
    expect(moved(order, 'd', 0)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('leaves a list of one as it is', () => {
    expect(moved(['a'], 'a', 5)).toEqual(['a'])
  })
})
