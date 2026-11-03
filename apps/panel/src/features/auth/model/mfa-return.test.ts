import { describe, expect, it } from 'vitest'
import { mfaPath, mfaReturnFor } from './mfa-return'

describe('mfaPath', () => {
  it('carries the path to return to', () => {
    expect(mfaPath('/convention-a/team')).toBe('/auth/mfa?redirect=%2Fconvention-a%2Fteam')
  })

  it('leaves out the start page', () => {
    expect(mfaPath('/')).toBe('/auth/mfa')
  })
})

describe('mfaReturnFor', () => {
  it.each([
    ['a sign-in', '/login', '?redirect=%2Fconvention-a%2Fteam', '/convention-a/team'],
    ['a sign-in with nothing to return to', '/login', '', '/'],
    ['an address on another origin', '/login', '?redirect=https%3A%2F%2Fevil.test', '/'],
    ['an invitation, which keeps its token', '/invitation', '?token=abc', '/invitation?token=abc'],
    [
      'a link, which comes back without its spent token',
      '/auth/confirm',
      '?token_hash=a&type=recovery',
      '/auth/confirm',
    ],
    ['any other page', '/convention-a/team', '?page=2', '/convention-a/team?page=2'],
  ])('%s', (_name, pathname, search, expected) => {
    expect(mfaReturnFor({ pathname, search })).toBe(expected)
  })
})
