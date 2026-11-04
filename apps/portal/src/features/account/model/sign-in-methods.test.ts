import { describe, expect, it } from 'vitest'
import { signInMethods } from './sign-in-methods'

describe('signInMethods', () => {
  it('offers the password to an email account', () => {
    expect(signInMethods(['password'])).toEqual({ password: true, google: false })
  })

  it('offers Google alone to a Google account', () => {
    expect(signInMethods(['google'])).toEqual({ password: false, google: true })
  })

  it('offers both to an account with both', () => {
    expect(signInMethods(['password', 'google'])).toEqual({ password: true, google: true })
  })

  it('offers the password when the methods say nothing', () => {
    expect(signInMethods([])).toEqual({ password: true, google: false })
  })
})
