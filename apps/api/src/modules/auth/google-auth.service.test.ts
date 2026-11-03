import { describe, expect, it } from 'vitest'
import {
  failureCode,
  GOOGLE_COOKIE_MAX_AGE_MS,
  googleFlowExpired,
  googleCookieValue,
  parseGoogleCookie,
  returnPath,
} from './google-auth.service'

const env = { PORTAL_URL: 'https://opos.land', PANEL_URL: 'https://panel.opos.land' }
const VERIFIER = 'v'.repeat(64)

describe('returnPath', () => {
  it.each([
    ['/account', '/account'],
    ['/account?confirm=deletion', '/account?confirm=deletion'],
    ['/invitation?token=abc', '/invitation?token=abc'],
    ['/a/../b', '/b'],
    ['/%5Cevil.example', '/%5Cevil.example'],
  ])('keeps the path %s of the application', (redirect, expected) => {
    expect(returnPath('portal', redirect, env)).toBe(expected)
  })

  it.each([
    'https://evil.example/x',
    'https://opos.land/x',
    '//evil.example',
    '//evil.example/account',
    '///evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/a/..//evil.example',
    '/.//evil.example',
    '/%2e%2e//evil.example',
    'javascript:alert(1)',
    'account',
    '',
    undefined,
    ['/account'],
    42,
  ])('takes the start page instead of %j', (redirect) => {
    expect(returnPath('portal', redirect, env)).toBe('/')
  })
})

describe('parseGoogleCookie', () => {
  const now = 1_000_000
  const valid = { verifier: VERIFIER, app: 'panel', path: '/invitation', expiresAt: now + 1 }
  const cookie = (value: unknown) => JSON.stringify(value)

  it('reads what googleCookieValue wrote', () => {
    const value = googleCookieValue({ verifier: VERIFIER, app: 'portal', path: '/a' }, now)

    expect(parseGoogleCookie(value)).toEqual({
      verifier: VERIFIER,
      app: 'portal',
      path: '/a',
      expiresAt: now + GOOGLE_COOKIE_MAX_AGE_MS,
    })
  })

  it('is as old as its Max-Age', () => {
    expect(GOOGLE_COOKIE_MAX_AGE_MS).toBe(600_000)
  })

  it('is expired once expiresAt has come, but still names its application', () => {
    expect(googleFlowExpired(valid, now)).toBe(false)
    expect(googleFlowExpired({ ...valid, expiresAt: now }, now)).toBe(true)
    expect(parseGoogleCookie(cookie({ ...valid, expiresAt: now - 1 }))).toMatchObject({
      app: 'panel',
    })
  })

  it.each([
    ['no cookie', undefined],
    ['text', 'abc'],
    ['an array', '[]'],
    ['null', 'null'],
    ['no verifier', cookie({ ...valid, verifier: undefined })],
    ['an empty verifier', cookie({ ...valid, verifier: '' })],
    ['a verifier with a slash', cookie({ ...valid, verifier: `${VERIFIER}/recovery` })],
    ['a verifier that is no string', cookie({ ...valid, verifier: 5 })],
    ['another application', cookie({ ...valid, app: 'cms' })],
    ['a path that is no string', cookie({ ...valid, path: 5 })],
    ['an expiry that is no number', cookie({ ...valid, expiresAt: '9999999' })],
    [
      'an expiry that is not finite',
      '{"verifier":"' + VERIFIER + '","app":"panel","path":"/","expiresAt":1e999}',
    ],
  ])('refuses %s', (_, value) => {
    expect(parseGoogleCookie(value)).toBeNull()
  })
})

describe('failureCode', () => {
  it.each([
    ['otp_expired', 'auth.otp_expired'],
    ['over_request_rate_limit', 'auth.over_request_rate_limit'],
  ])('passes the listed code %s on as %s', (code, expected) => {
    expect(failureCode(code)).toBe(expected)
  })

  it.each([
    'unexpected_failure',
    'user_already_exists',
    'email_exists',
    'signup_disabled',
    '../../x',
    '<script>',
    '',
    undefined,
    ['otp_expired'],
  ])('answers auth.google-failed to %j, which no code of the contract names', (code) => {
    expect(failureCode(code)).toBe('auth.google-failed')
  })
})
