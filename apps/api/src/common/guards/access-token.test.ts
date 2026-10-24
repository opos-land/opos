import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { accessTokenKey, bearerToken, verifyAccessToken } from './access-token'

const key = accessTokenKey({ JWT_SECRET: 'x'.repeat(32), AUTH_URL: 'http://auth.test' })

const token = (claims: { sub?: string; iss?: string; exp?: string | null } = {}) => {
  const jwt = new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub ?? randomUUID())
    .setAudience('authenticated')
    .setIssuer(claims.iss ?? 'http://auth.test')
  if (claims.exp !== null) jwt.setExpirationTime(claims.exp ?? '5m')
  return jwt.sign(key.key)
}

describe('bearerToken', () => {
  it.each([
    ['Bearer abc', 'abc'],
    ['bearer abc', undefined],
    ['Bearer ', undefined],
    ['Bearer a b', undefined],
    [undefined, undefined],
    [['Bearer abc'], undefined],
  ])('reads %o as %o', (header, expected) => {
    expect(bearerToken(header)).toBe(expected)
  })
})

describe('verifyAccessToken', () => {
  it('returns the payload of a valid token', async () => {
    const sub = randomUUID()

    expect(await verifyAccessToken(await token({ sub }), key)).toMatchObject({ sub })
  })

  it.each([
    ['an expired token', () => token({ exp: '-1m' })],
    ['a token without exp', () => token({ exp: null })],
    ['a foreign issuer', () => token({ iss: 'http://evil.test' })],
    ['a sub that is not a uuid', () => token({ sub: 'not-a-uuid' })],
    ['garbage', () => Promise.resolve('not.a.jwt')],
  ])('refuses %s', async (_, make) => {
    expect(await verifyAccessToken(await make(), key)).toBeUndefined()
  })
})
