import { describe, expect, it } from 'vitest'
import { tokenFromHash } from './order-link'

// docs/specs/0009-buyer-self-service.md, K1: the token of an order link comes after the `#` of
// the portal's address, which no browser sends to a server.
describe('the token of an order link', () => {
  it('is what follows the # of the address', () => {
    expect(tokenFromHash('#abcDEF_123-xyz456789012')).toBe('abcDEF_123-xyz456789012')
  })

  it.each(['', '#', '#short', `#${'x'.repeat(201)}`, '#with space in the token here'])(
    'is none in %j',
    (hash) => {
      expect(tokenFromHash(hash)).toBeNull()
    },
  )
})
