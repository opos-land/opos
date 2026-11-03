import { describe, expect, it } from 'vitest'
import { googleSignInUrl } from './google-url'

const parse = (returnTo: string) => new URL(googleSignInUrl('http://api.test', returnTo))

describe('googleSignInUrl', () => {
  it('names the panel and the path to return to', () => {
    const url = parse('/convention-a/team?tab=1')

    expect(url.origin + url.pathname).toBe('http://api.test/auth/google')
    expect(url.searchParams.get('app')).toBe('panel')
    expect(url.searchParams.get('redirect')).toBe('/convention-a/team?tab=1')
  })

  it('sends the start page for a return that is not a path of the panel', () => {
    expect(parse('https://evil.test').searchParams.get('redirect')).toBe('/')
    expect(parse('//evil.test').searchParams.get('redirect')).toBe('/')
  })
})
