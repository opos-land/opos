import { describe, expect, it } from 'vitest'
import { mfaPath, mfaReturnFor, withMfaReturn } from './mfa-return'

describe('mfaPath', () => {
  it('carries the path to return to', () => {
    expect(mfaPath('/conventions/convention-a')).toBe(
      '/auth/mfa?redirect=%2Fconventions%2Fconvention-a',
    )
  })

  it('leaves out the start page', () => {
    expect(mfaPath('/account')).toBe('/auth/mfa')
  })
})

describe('mfaReturnFor', () => {
  it.each([
    ['a sign-in', '/login', '?redirect=%2Fschedule', '/schedule'],
    ['a sign-in with nothing to return to', '/login', '', '/account'],
    ['a registration', '/register', '?redirect=%2Fprivacy', '/privacy'],
    ['an address on another origin', '/login', '?redirect=https%3A%2F%2Fevil.test', '/account'],
    [
      'a link, which comes back without its spent token',
      '/auth/confirm',
      '?token_hash=a&type=recovery',
      '/auth/confirm',
    ],
    ['any other page', '/schedule', '?day=2', '/schedule?day=2'],
  ])('%s', (_name, pathname, search, expected) => {
    expect(mfaReturnFor({ pathname, search })).toBe(expected)
  })
})

describe('withMfaReturn', () => {
  it('names the return path for the call it wraps, and only for that', async () => {
    const seen: string[] = []

    await withMfaReturn('/account?confirm=deletion', () => {
      seen.push(mfaReturnFor({ pathname: '/account', search: '' }))
      return Promise.resolve()
    })
    seen.push(mfaReturnFor({ pathname: '/account', search: '' }))

    expect(seen).toEqual(['/account?confirm=deletion', '/account'])
  })

  it('is lifted when the call fails', async () => {
    await expect(withMfaReturn('/x', () => Promise.reject(new Error('no')))).rejects.toThrow('no')

    expect(mfaReturnFor({ pathname: '/account', search: '' })).toBe('/account')
  })
})
