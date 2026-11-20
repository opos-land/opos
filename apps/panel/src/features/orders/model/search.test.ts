import { describe, expect, it } from 'vitest'
import { pageOf, searchOf } from './search'

// What the search box of an edition's orders sends (docs/specs/0006-order-management.md, F1).
describe('searchOf', () => {
  it('sends a part of a number, a name or an email as it is typed, trimmed', async () => {
    expect(await searchOf('  hopper ')).toEqual({ q: 'hopper' })
    expect(await searchOf('ABCDEFGHJK')).toEqual({ q: 'ABCDEFGHJK' })
  })

  it('sends nothing for no text', async () => {
    expect(await searchOf('   ')).toEqual({})
  })

  // The code itself never travels in an address, where a log would keep it.
  it('sends the SHA-256 hash of a QR code, never the code', async () => {
    const code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

    expect(await searchOf(` ${code} `)).toEqual({
      qrCodeHash: '2fd67e69907bff621c0c4078b1aef595c8562a11f840dd0ec5c5d7c0a4e59331',
    })
    // Read out and typed in small letters, it is the same code.
    expect(await searchOf(code.toLowerCase())).toEqual(await searchOf(code))
  })
})

describe('pageOf', () => {
  it('names the orders a page shows and whether another follows or comes before', () => {
    expect(pageOf({ offset: 0, shown: 50, total: 120 })).toEqual({
      first: 1,
      last: 50,
      previous: null,
      next: 50,
    })
    expect(pageOf({ offset: 100, shown: 20, total: 120 })).toEqual({
      first: 101,
      last: 120,
      previous: 50,
      next: null,
    })
    expect(pageOf({ offset: 0, shown: 0, total: 0 })).toEqual({
      first: 0,
      last: 0,
      previous: null,
      next: null,
    })
  })
})
