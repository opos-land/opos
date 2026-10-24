import { describe, expect, it } from 'vitest'
import { loginPath, safeRedirect, withRedirect } from './redirect'

describe('safeRedirect', () => {
  it('keeps a path inside the portal', () => {
    expect(safeRedirect('/conventions/convention-a?x=1')).toBe('/conventions/convention-a?x=1')
  })

  it.each([null, '', 'https://evil.test', '//evil.test', '/\\evil.test', 'account'])(
    'sends %j to the account page',
    (value) => {
      expect(safeRedirect(value)).toBe('/account')
    },
  )
})

describe('withRedirect', () => {
  it('carries the page to return to', () => {
    expect(loginPath('/conventions/convention-a')).toBe(
      '/login?redirect=%2Fconventions%2Fconvention-a',
    )
    expect(withRedirect('/register', '/privacy')).toBe('/register?redirect=%2Fprivacy')
  })

  it('leaves the signed-in start page out', () => {
    expect(loginPath('/account')).toBe('/login')
  })
})
