import { describe, expect, it } from 'vitest'
import { googleSignInUrl } from './google-url'

const parse = (returnTo: string) => new URL(googleSignInUrl('http://api.test', returnTo))

describe('googleSignInUrl', () => {
  it('names the portal and the path to return to', () => {
    const url = parse('/conventions/a/2027?tab=1')

    expect(url.origin + url.pathname).toBe('http://api.test/auth/google')
    expect(url.searchParams.get('app')).toBe('portal')
    expect(url.searchParams.get('redirect')).toBe('/conventions/a/2027?tab=1')
  })

  it('keeps the query of the deletion confirmation in the path', () => {
    expect(parse('/account?confirm=deletion').searchParams.get('redirect')).toBe(
      '/account?confirm=deletion',
    )
  })

  it('sends the start page for a return that is not a path of the portal', () => {
    expect(parse('https://evil.test').searchParams.get('redirect')).toBe('/account')
    expect(parse('//evil.test').searchParams.get('redirect')).toBe('/account')
  })
})
