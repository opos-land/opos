import { ORPCError } from '@orpc/client'
import { describe, expect, it } from 'vitest'
import { deletionRefusal } from './deletion'

describe('deletionRefusal', () => {
  it('tells the last head organizer apart', () => {
    expect(deletionRefusal(new ORPCError('membership.last-head', { status: 409 }))).toBe(
      'last-head',
    )
  })

  it('asks to confirm again when the sign-in is too old', () => {
    expect(
      deletionRefusal(new ORPCError('session.reauthentication-required', { status: 401 })),
    ).toBe('reauthenticate')
  })

  it('leaves anything else to the generic message', () => {
    expect(deletionRefusal(new TypeError('Failed to fetch'))).toBe('other')
  })
})
