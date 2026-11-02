import { describe, expect, it } from 'vitest'
import { unavailable } from './api-error'

describe('unavailable', () => {
  it('is an expected 503 server.unavailable that asks to retry in 30 seconds', () => {
    const error = unavailable()

    expect(error).toMatchObject({
      code: 'server.unavailable',
      headers: { 'Retry-After': '30' },
      expected: true,
    })
    expect(error.getStatus()).toBe(503)
  })
})
