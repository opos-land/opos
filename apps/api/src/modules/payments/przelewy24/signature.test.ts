import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  cardFailureSignature,
  cardSuccessSignature,
  CHANNELS,
  notificationSignature,
  registrationSignature,
  signatureHolds,
  timeLimitMinutes,
  verificationSignature,
} from './signature'

// The signatures of Przelewy24 (docs/specs/0005-przelewy24.md, Tests), each against the JSON its
// documentation writes out, hashed here by hand: the fields in the documentation's order, the CRC
// key last, no space, and neither a slash nor a letter outside ASCII escaped.

const sha384 = (json: string) => createHash('sha384').update(json).digest('hex')
const crc = 'crc-from-p24-panel'

describe('the signatures of Przelewy24', () => {
  it('signs a registration over the session, the merchant, the amount and the currency', () => {
    expect(
      registrationSignature(
        { sessionId: 'unique-session-id', merchantId: 999999, amount: 1234, currency: 'PLN' },
        crc,
      ),
    ).toBe(
      sha384(
        '{"sessionId":"unique-session-id","merchantId":999999,"amount":1234,"currency":"PLN","crc":"crc-from-p24-panel"}',
      ),
    )
  })

  it('signs a verification over the session, the provider’s number, the amount and the currency', () => {
    expect(
      verificationSignature(
        { sessionId: 'unique-session-id', orderId: 999999, amount: 1234, currency: 'PLN' },
        crc,
      ),
    ).toBe(
      sha384(
        '{"sessionId":"unique-session-id","orderId":999999,"amount":1234,"currency":"PLN","crc":"crc-from-p24-panel"}',
      ),
    )
  })

  it('reads the signature of a notification over its nine fields, in the documentation’s order', () => {
    expect(
      notificationSignature(
        {
          merchantId: 999999,
          posId: 999999,
          sessionId: 'unique-session-id',
          amount: 1234,
          originAmount: 1234,
          currency: 'PLN',
          // It outgrows a 32-bit number.
          orderId: 3_000_000_001,
          methodId: 154,
          statement: 'p24-A12-B34-C56',
        },
        crc,
      ),
    ).toBe(
      sha384(
        '{"merchantId":999999,"posId":999999,"sessionId":"unique-session-id","amount":1234,"originAmount":1234,"currency":"PLN","orderId":3000000001,"methodId":154,"statement":"p24-A12-B34-C56","crc":"crc-from-p24-panel"}',
      ),
    )
  })

  // The provider writes a slash and a Polish letter as they are; so does the signature.
  it('escapes neither a slash nor a letter outside ASCII', () => {
    expect(
      notificationSignature(
        {
          merchantId: 1,
          posId: 1,
          sessionId: 's',
          amount: 1,
          originAmount: 1,
          currency: 'PLN',
          orderId: 1,
          methodId: 1,
          statement: 'Zażółć/gęślą',
        },
        crc,
      ),
    ).toBe(
      sha384(
        '{"merchantId":1,"posId":1,"sessionId":"s","amount":1,"originAmount":1,"currency":"PLN","orderId":1,"methodId":1,"statement":"Zażółć/gęślą","crc":"crc-from-p24-panel"}',
      ),
    )
  })

  it('reads the signature of a card notification, of a payment that went through and of a refusal', () => {
    expect(
      cardSuccessSignature(
        {
          amount: 1234,
          '3ds': true,
          method: 242,
          refId: 'ref',
          orderId: 3_000_000_001,
          sessionId: 's',
          bin: 411111,
          maskedCCNumber: '411111XXXXXX1111',
          ccExp: '122030',
          hash: 'h',
          cardCountry: 'PL',
          risk: 0,
          liabilityshift: false,
        },
        crc,
      ),
    ).toBe(
      sha384(
        '{"amount":1234,"3ds":true,"method":242,"refId":"ref","orderId":3000000001,"sessionId":"s","bin":411111,"maskedCCNumber":"411111XXXXXX1111","ccExp":"122030","hash":"h","cardCountry":"PL","risk":0,"liabilityshift":false,"crc":"crc-from-p24-panel"}',
      ),
    )
    expect(
      cardFailureSignature(
        {
          amount: 1234,
          '3ds': false,
          method: 242,
          orderId: 3_000_000_001,
          sessionId: 's',
          errorCode: 'err56',
          errorMessage: 'Błędna karta',
        },
        crc,
      ),
    ).toBe(
      sha384(
        '{"amount":1234,"3ds":false,"method":242,"orderId":3000000001,"sessionId":"s","errorCode":"err56","errorMessage":"Błędna karta","crc":"crc-from-p24-panel"}',
      ),
    )
  })

  it('holds only for the signature expected, whatever its case, and for nothing that is no text', () => {
    const expected = sha384('x')

    expect(signatureHolds(expected, expected)).toBe(true)
    expect(signatureHolds(expected.toUpperCase(), expected)).toBe(true)
    expect(signatureHolds(`${expected.slice(0, -1)}0`, expected)).toBe(expected.endsWith('0'))
    expect(signatureHolds(sha384('y'), expected)).toBe(false)
    expect(signatureHolds('', expected)).toBe(false)
    for (const nothing of [undefined, null, 12, {}, []]) {
      expect(signatureHolds(nothing, expected)).toBe(false)
    }
  })
})

describe('the time limit of a transaction', () => {
  const now = new Date('2026-05-01T10:00:00Z')
  const in_ = (seconds: number) => new Date(now.getTime() + seconds * 1000)

  // The whole minutes left of the order's hold, at least one, at most the 99 the provider takes.
  it.each([
    [30 * 60, 30],
    [29 * 60 + 59, 29],
    [60, 1],
    [59, 1],
    [0, 1],
    [-60, 1],
    [99 * 60, 99],
    [200 * 60, 99],
  ])('is %i seconds of hold left as %i minutes', (seconds, minutes) => {
    expect(timeLimitMinutes(in_(seconds), now)).toBe(minutes)
  })
})

describe('the channels of a transaction', () => {
  // Cards with Apple Pay and Google Pay, bank transfers and BLIK; neither the traditional
  // transfer (4) nor the advance payment (32), instalments (128) or wallets (256).
  it('are cards, bank transfers and BLIK, and nothing else', () => {
    expect(CHANNELS).toBe(1 + 2 + 8192)
    for (const left of [4, 16, 32, 64, 128, 256, 4096, 16384]) {
      expect(CHANNELS & left).toBe(0)
    }
  })
})
