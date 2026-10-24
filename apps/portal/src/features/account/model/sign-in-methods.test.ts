import { describe, expect, it } from 'vitest'
import { signInMethods } from './sign-in-methods'

const user = (providers: string[], identities: string[] = providers) => ({
  app_metadata: { providers },
  identities: identities.map((provider) => ({
    id: provider,
    user_id: 'u',
    identity_id: provider,
    provider,
  })),
})

describe('signInMethods', () => {
  it('offers the password to an email account', () => {
    expect(signInMethods(user(['email']))).toEqual({ password: true, google: false })
  })

  it('offers Google alone to a Google account', () => {
    expect(signInMethods(user(['google']))).toEqual({ password: false, google: true })
  })

  it('offers both to an account with both identities', () => {
    expect(signInMethods(user(['email'], ['email', 'google']))).toEqual({
      password: true,
      google: true,
    })
  })

  it('offers the password when the providers say nothing', () => {
    expect(signInMethods({ app_metadata: {}, identities: [] })).toEqual({
      password: true,
      google: false,
    })
  })
})
