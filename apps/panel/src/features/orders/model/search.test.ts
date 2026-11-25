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

  // Read out at the desk, a code is typed as it is heard: in groups, with spaces or hyphens.
  it('sends the hash of a QR code typed in groups, as of the code unbroken', async () => {
    const code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    const hashed = await searchOf(code)

    expect(await searchOf('ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567')).toEqual(hashed)
    expect(await searchOf('abcd-efgh-ijkl-mnop-qrst-uvwx-yz23-4567')).toEqual(hashed)
    expect(await searchOf(' ABCDEFGHIJKLMNOP  QRSTUVWXYZ234567 ')).toEqual(hashed)
  })

  it('sends nothing of a QR code typed in groups with a mistake in it, or among other words', async () => {
    for (const text of [
      // A character missing, one too many, and one a code never holds.
      'ABCD EFGH IJKL MNOP QRST UVWX YZ23 456',
      'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-45678',
      'ABCD EFGH IJKL MNOP QRST UVWX YZ23 4561',
      'The QR code: ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
      'code ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    ]) {
      expect(await searchOf(text)).toEqual({ refused: 'qr-code' })
    }
  })

  it('sends a name of several words as it is typed, however long: a name has no digit', async () => {
    for (const name of [
      'Hubert Blaine Wolfeschlegelsteinhausenbergerdorff',
      // 32 letters a code could hold, once its spaces are gone.
      'Christopher Montgomery Wellingtons',
      'Anna-Maria Skłodowska-Curie de Saint-Exupéry',
    ]) {
      expect(await searchOf(name)).toEqual({ q: name })
    }
  })

  // A code with a character missing or mistyped is still a secret: it is not sent as a text
  // to search names by, where it would travel in the address.
  it('sends nothing of a text that looks like a QR code with a mistake in it', async () => {
    for (const text of [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ2345678',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456!',
      'abcdefghijklmnopqrstuv2345',
    ]) {
      expect(await searchOf(text)).toEqual({ refused: 'qr-code' })
    }
    // A long name or address is no code.
    expect(await searchOf('Wolfeschlegelsteinhausenbergerdorff')).toEqual({
      q: 'Wolfeschlegelsteinhausenbergerdorff',
    })
    expect(await searchOf('a.very.long.address.of.a.buyer@example.test')).toEqual({
      q: 'a.very.long.address.of.a.buyer@example.test',
    })
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
