import { i18n } from '@lingui/core'
import { type Member } from '@opos/contract'
import { beforeAll, describe, expect, it } from 'vitest'
import { invitationNotice } from './invitation'

const member: Member = {
  id: 'm-1',
  account: { id: 'a-1', email: 'ann@x.test', firstName: 'Ann', lastName: 'Lee' },
  role: 'org',
  settingsAccess: 'none',
  brandingAccess: 'none',
  shopConfigAccess: 'none',
  expiresAt: null,
  expired: false,
}

const format = (iso: string) => `the tenant's wall clock of ${iso}`

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

describe('invitationNotice', () => {
  it('names the confirmed account that joined at once', () => {
    expect(i18n._(invitationNotice({ outcome: 'added', member }, format))).toBe(
      'Added to the team: Ann Lee. They have been told by email.',
    )
  })

  it('names the address and the end of the link sent to anyone else', () => {
    const sent = {
      outcome: 'invited',
      email: 'new@x.test',
      validUntil: '2027-01-08T10:00:00Z',
    } as const

    expect(i18n._(invitationNotice(sent, format))).toBe(
      "An invitation has gone to new@x.test. Its link works once, until the tenant's wall clock of 2027-01-08T10:00:00Z.",
    )
  })
})
