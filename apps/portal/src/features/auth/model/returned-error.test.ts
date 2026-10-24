import { describe, expect, it } from 'vitest'
import { linkState, returnedError } from './returned-error'

describe('returnedError', () => {
  it('reads the code from the query', () => {
    expect(
      returnedError({ search: '?error=access_denied&error_code=otp_expired', hash: '' }),
    ).toMatchObject({ code: 'otp_expired' })
  })

  it('reads the code from the fragment', () => {
    expect(returnedError({ search: '', hash: '#error_code=otp_expired' })).toMatchObject({
      code: 'otp_expired',
    })
  })

  it('is null for an address without an error', () => {
    expect(returnedError({ search: '?code=abc', hash: '' })).toBeNull()
  })
})

describe('linkState', () => {
  it('hands over the code', () => {
    expect(linkState({ search: '?code=abc', hash: '' })).toEqual({ code: 'abc', error: null })
  })

  it('treats a link without a code as expired', () => {
    expect(linkState({ search: '', hash: '' })).toMatchObject({
      code: null,
      error: { code: 'otp_expired' },
    })
  })

  it('prefers the reported error over the code', () => {
    expect(
      linkState({ search: '?code=abc&error_code=flow_state_expired', hash: '' }),
    ).toMatchObject({ code: null, error: { code: 'flow_state_expired' } })
  })
})
