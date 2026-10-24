import { describe, expect, it } from 'vitest'
import { loginPath, safeRedirect } from './redirect'

describe('safeRedirect', () => {
  it('keeps a path inside the panel', () => {
    expect(safeRedirect('/convention-a/team?x=1')).toBe('/convention-a/team?x=1')
  })

  it.each([null, '', 'https://evil.test', '//evil.test', '/\\evil.test', 'convention-a'])(
    'sends %j to the start page',
    (value) => {
      expect(safeRedirect(value)).toBe('/')
    },
  )
})

describe('loginPath', () => {
  it('carries the page to return to', () => {
    expect(loginPath('/convention-a/team')).toBe('/login?redirect=%2Fconvention-a%2Fteam')
    expect(loginPath('/')).toBe('/login')
  })
})
