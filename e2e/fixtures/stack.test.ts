import { describe, expect, it } from 'vitest'
import { portOf, stack } from './stack'

describe('the stack under test', () => {
  it('reads the addresses from the API configuration', () => {
    expect(new URL(stack.panel).hostname).toBe('panel.opos.localhost')
    expect(new URL(stack.api).hostname).toBe('api.opos.localhost')
    expect(new URL(stack.portal).hostname).toBe('opos.localhost')
  })

  it('finds Supabase Auth under the gateway and holds the secret key', () => {
    expect(new URL(stack.auth).pathname).toBe('/auth/v1')
    expect(stack.secretKey).not.toBe('')
  })

  it('gives the port a dev server binds for an address', () => {
    expect(portOf('http://panel.opos.localhost:5173')).toBe('5173')
    expect(portOf('http://opos.localhost')).toBe('80')
    expect(portOf('https://opos.land')).toBe('443')
  })
})
