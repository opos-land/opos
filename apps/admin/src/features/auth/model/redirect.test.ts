import { describe, expect, it } from 'vitest'
import { loginPath, safeRedirect } from './redirect'

describe('safeRedirect', () => {
  it('keeps a path inside the admin application', () => {
    expect(safeRedirect('/conventions/new?x=1')).toBe('/conventions/new?x=1')
  })

  it.each([
    null,
    '',
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/\t/evil.test',
    '/\n/evil.test',
    '/\r\n/evil.test',
    '/.//evil.test',
    '/..//evil.test',
    '/%2e//evil.test',
    'convention-a',
  ])('sends %j to the start page', (value) => {
    expect(safeRedirect(value)).toBe('/')
  })
})

describe('loginPath', () => {
  it('carries the page to return to', () => {
    expect(loginPath('/conventions/new')).toBe('/login?redirect=%2Fconventions%2Fnew')
    expect(loginPath('/')).toBe('/login')
  })
})
