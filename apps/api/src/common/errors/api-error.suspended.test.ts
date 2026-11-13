import { describe, expect, it } from 'vitest'
import { ApiError, forbidden, suspendedAsNotFound, tenantSuspended } from './api-error'

// A public route answers a suspended convention as an unknown address, also when the suspension
// landed between the lookup of the address and the opening of the tenant's transaction.
describe('suspendedAsNotFound', () => {
  it('turns the refusal of a suspended tenant into a 404 that names no suspension', () => {
    let thrown: unknown
    try {
      suspendedAsNotFound('convention')(tenantSuspended())
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ApiError)
    expect(thrown).toMatchObject({ code: 'request.not-found', message: 'Unknown convention' })
    expect((thrown as ApiError).getStatus()).toBe(404)
  })

  it.each([forbidden(), new Error('database down')])('passes %s on as it is', (error) => {
    expect(() => suspendedAsNotFound('convention')(error)).toThrow(error)
  })
})
