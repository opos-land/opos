import { describe, expect, it } from 'vitest'
import { accountOf, FIELDS, providerDate, reasonOf } from './account'

const given = {
  merchantId: '123456',
  posId: '123456',
  crc: 'a1b2c3d4e5f60708',
  apiKey: '0123456789abcdef0123456789abcdef',
  sandbox: 'false',
  abandonedPaymentEmailOff: 'true',
}

describe('the credentials of a Przelewy24 account', () => {
  it('are the merchant and the point of sale, the two keys, and the two answers of the org', () => {
    expect(Object.values(FIELDS).sort()).toEqual(Object.keys(given).sort())
    expect(accountOf(given)).toEqual({
      merchantId: 123456,
      posId: 123456,
      crc: 'a1b2c3d4e5f60708',
      apiKey: '0123456789abcdef0123456789abcdef',
      sandbox: false,
      abandonedPaymentEmailOff: true,
    })
    expect(
      accountOf({ ...given, sandbox: 'true', abandonedPaymentEmailOff: 'false' }),
    ).toMatchObject({ sandbox: true, abandonedPaymentEmailOff: false })
  })

  it.each([
    ['an identifier that is no number', { merchantId: '12a' }],
    ['an identifier of zero', { posId: '0' }],
    ['an identifier with a sign or a fraction', { posId: '-5' }],
    ['an identifier too long to be one', { merchantId: '1'.repeat(16) }],
    ['a key left out', { crc: undefined }],
    ['a key that is blank', { apiKey: '  ' }],
    ['an answer that is neither yes nor no', { sandbox: 'maybe' }],
    ['an answer left out', { abandonedPaymentEmailOff: undefined }],
  ])('are no account with %s', (_, changes) => {
    expect(accountOf({ ...given, ...changes } as Record<string, string>)).toBeUndefined()
  })
})

describe('the reason of a refusal', () => {
  // The buyer reads one of the shop's own short list; a code the module does not know is the
  // general failure. The provider's own code and message stay on the attempt, for the orgs.
  it.each([
    ['err161', 'canceled'],
    ['err162', 'canceled'],
    ['err102', 'timed-out'],
    ['err105', 'timed-out'],
    ['err56', 'declined'],
    ['err49', 'declined'],
    ['ERR56', 'declined'],
    ['51', 'failed'],
    ['', 'failed'],
    ['anything else', 'failed'],
  ] as const)('reads %s as %s', (code, reason) => {
    expect(reasonOf(code)).toBe(reason)
  })
})

describe('a date of the provider', () => {
  // Its own clock is Warsaw's: a date written as digits is read in that zone, summer and winter.
  it('reads digits as a moment in Warsaw', () => {
    expect(providerDate('20260115103000')?.toISOString()).toBe('2026-01-15T09:30:00.000Z')
    expect(providerDate('20260715103000')?.toISOString()).toBe('2026-07-15T08:30:00.000Z')
    expect(providerDate('202607151030')?.toISOString()).toBe('2026-07-15T08:30:00.000Z')
  })

  it('reads a date that names its own zone as it stands, and nothing from anything else', () => {
    expect(providerDate('2026-07-15T08:30:00Z')?.toISOString()).toBe('2026-07-15T08:30:00.000Z')
    for (const nothing of ['', 'soon', '2026', '20261315103000', undefined, null, 12]) {
      expect(providerDate(nothing)).toBeUndefined()
    }
  })
})
