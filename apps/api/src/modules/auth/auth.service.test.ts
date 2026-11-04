import { describe, expect, it } from 'vitest'
import { confirmedBeforeItsLink } from './auth.service'

const earlier = '2026-11-04T10:02:38.100000Z'
const later = '2026-11-04T10:02:38.900000Z'

describe('confirmedBeforeItsLink', () => {
  it('holds for an address confirmed before the link was sent', () => {
    expect(confirmedBeforeItsLink({ email_confirmed_at: earlier, recovery_sent_at: later })).toBe(
      true,
    )
    expect(confirmedBeforeItsLink({ email_confirmed_at: earlier, recovery_sent_at: earlier })).toBe(
      true,
    )
  })

  it('does not hold for an address the link confirmed', () => {
    expect(confirmedBeforeItsLink({ email_confirmed_at: later, recovery_sent_at: earlier })).toBe(
      false,
    )
  })

  it.each([
    ['no user', null],
    ['no stamps', {}],
    ['no confirmation', { recovery_sent_at: later }],
    ['no sending', { email_confirmed_at: earlier }],
    ['an unparsable confirmation', { email_confirmed_at: 'soon', recovery_sent_at: later }],
    ['an unparsable sending', { email_confirmed_at: earlier, recovery_sent_at: 'soon' }],
  ])('fails closed on %s', (_, user) => {
    expect(confirmedBeforeItsLink(user)).toBe(false)
  })
})
