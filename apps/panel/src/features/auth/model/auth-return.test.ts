import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_RETURN_STORAGE_KEY,
  authReturn,
  forgetAuthReturn,
  rememberAuthReturn,
} from './auth-return'
import { rememberInvitation, setAwaitingPassword } from './invitation-storage'

beforeEach(() => {
  localStorage.clear()
})

describe('authReturn', () => {
  it('goes to the start page when nothing started a round trip', () => {
    expect(authReturn()).toBe('/')
  })

  it('goes back to the page the round trip started on', () => {
    rememberAuthReturn('/convention-a/team')

    expect(authReturn()).toBe('/convention-a/team')
  })

  it('ignores a stored invitation that waits for nothing', () => {
    // A dead or mismatched invitation must not take over a later sign-in.
    rememberInvitation('token-a')

    expect(authReturn()).toBe('/')
  })

  it('prefers the page that started the round trip over a stored invitation', () => {
    rememberInvitation('token-a')
    setAwaitingPassword(true)
    rememberAuthReturn('/convention-a')

    expect(authReturn()).toBe('/convention-a')
  })

  it('returns to an invitation waiting for its password link', () => {
    rememberInvitation('token-a')
    setAwaitingPassword(true)

    expect(authReturn()).toBe('/invitation')
  })

  it('is gone once forgotten', () => {
    rememberAuthReturn('/convention-a')
    forgetAuthReturn()

    expect(authReturn()).toBe('/')
  })

  it('never leaves the panel', () => {
    rememberAuthReturn('https://evil.test')
    expect(authReturn()).toBe('/')

    localStorage.setItem(AUTH_RETURN_STORAGE_KEY, '//evil.test')
    expect(authReturn()).toBe('/')
  })
})
