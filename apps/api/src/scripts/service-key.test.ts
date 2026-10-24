import { describe, expect, it } from 'vitest'
import { signingSecret } from './service-key'

const DEV = 'dev-jwt-secret-at-least-32-characters-long'
const PRODUCTION = 'production-jwt-secret-at-least-32-characters'

describe('signingSecret', () => {
  it('signs with an explicit secret', () => {
    expect(signingSecret(PRODUCTION, DEV, false)).toEqual({ secret: PRODUCTION })
  })

  it('refuses a missing secret instead of falling back to the dev one', () => {
    expect(signingSecret(undefined, DEV, false)).toHaveProperty('error')
  })

  it('refuses the dev secret without --dev', () => {
    expect(signingSecret(DEV, DEV, false)).toEqual({
      error: expect.stringContaining('--dev') as string,
    })
  })

  it('signs with the dev secret under --dev, set or not', () => {
    expect(signingSecret(undefined, DEV, true)).toEqual({ secret: DEV })
    expect(signingSecret(DEV, DEV, true)).toEqual({ secret: DEV })
  })

  it('refuses a secret shorter than 32 characters', () => {
    expect(signingSecret('short', DEV, false)).toHaveProperty('error')
    expect(signingSecret('short', DEV, true)).toHaveProperty('error')
  })
})
