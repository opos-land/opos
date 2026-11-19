import { ORDER_NUMBER_ALPHABET, ORDER_NUMBER_LENGTH } from '@opos/contract'
import { describe, expect, it } from 'vitest'
import { hashOf, orderNumber, qrCode, secretToken } from './codes'

describe('the number of an order', () => {
  it('is ten characters, none of them mistaken for another', () => {
    for (let n = 0; n < 200; n += 1) {
      const number = orderNumber()

      expect(number).toHaveLength(ORDER_NUMBER_LENGTH)
      expect([...number].every((character) => ORDER_NUMBER_ALPHABET.includes(character))).toBe(true)
    }
  })

  // It carries no personal data and does not tell how many orders came before it.
  it('is drawn at random, each character of the whole alphabet', () => {
    const drawn = new Set(Array.from({ length: 400 }, () => orderNumber()))
    const characters = new Set([...drawn].join(''))

    expect(drawn.size).toBe(400)
    expect(characters.size).toBe(ORDER_NUMBER_ALPHABET.length)
  })
})

describe('a secret of an order', () => {
  it('carries at least 128 random bits, as a token and as a QR code', () => {
    // 22 characters of base64url are 132 bits; 26 of base32 are 130.
    expect(secretToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(qrCode()).toMatch(/^[A-Z2-7]{32}$/)
    expect(new Set(Array.from({ length: 100 }, () => secretToken())).size).toBe(100)
    expect(new Set(Array.from({ length: 100 }, () => qrCode())).size).toBe(100)
  })

  it('is stored as a hash that names it and tells nothing of it', () => {
    const token = secretToken()

    expect(hashOf(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashOf(token)).toBe(hashOf(token))
    expect(hashOf(token)).not.toBe(hashOf(`${token}x`))
    expect(hashOf(token)).not.toContain(token)
  })
})
