import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_RETURN_STORAGE_KEY,
  authReturn,
  forgetAuthReturn,
  rememberAuthReturn,
} from './auth-return'

beforeEach(() => {
  localStorage.clear()
})

describe('authReturn', () => {
  it('goes to the account page when nothing started a round trip', () => {
    expect(authReturn()).toBe('/account')
  })

  it('goes back to the page the round trip started on', () => {
    rememberAuthReturn('/conventions/convention-a')

    expect(authReturn()).toBe('/conventions/convention-a')
  })

  it('is gone once forgotten', () => {
    rememberAuthReturn('/conventions/convention-a')
    forgetAuthReturn()

    expect(authReturn()).toBe('/account')
  })

  it('never leaves the portal', () => {
    rememberAuthReturn('https://evil.test')
    expect(authReturn()).toBe('/account')

    localStorage.setItem(AUTH_RETURN_STORAGE_KEY, '//evil.test')
    expect(authReturn()).toBe('/account')
  })
})
