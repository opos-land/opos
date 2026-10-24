import { fromZonedWallTime } from '@opos/i18n'
import { describe, expect, it } from 'vitest'
import { memberChange, type MemberFormValues, memberName } from './member'

const warsaw = (value: string) => fromZonedWallTime(value, 'Europe/Warsaw')?.toISOString() ?? null

const org: MemberFormValues = {
  role: 'org',
  settingsAccess: 'read',
  shopConfigAccess: 'none',
  expiresAt: '',
}

describe('memberName', () => {
  const account = { id: 'a', email: 'ann@example.com', firstName: null, lastName: null }

  it('joins the names, or falls back to the email', () => {
    expect(memberName({ account: { ...account, firstName: 'Ann', lastName: 'Lee' } })).toBe(
      'Ann Lee',
    )
    expect(memberName({ account })).toBe('ann@example.com')
  })
})

describe('memberChange', () => {
  it('sends only the fields that changed', () => {
    expect(memberChange(org, { ...org, shopConfigAccess: 'read' }, warsaw)).toEqual({
      shopConfigAccess: 'read',
    })
    expect(memberChange(org, org, warsaw)).toEqual({})
  })

  it("sends an expiry as an instant of the tenant's zone, and null to remove it", () => {
    expect(memberChange(org, { ...org, expiresAt: '2027-01-01T00:00' }, warsaw)).toEqual({
      expiresAt: '2026-12-31T23:00:00.000Z',
    })
    expect(memberChange({ ...org, expiresAt: '2027-01-01T00:00' }, org, warsaw)).toEqual({
      expiresAt: null,
    })
  })

  it('promotes to head with the role alone', () => {
    expect(
      memberChange(
        org,
        { ...org, role: 'head', settingsAccess: 'write', expiresAt: '2027-01-01T00:00' },
        warsaw,
      ),
    ).toEqual({ role: 'head' })
  })

  it('demotes a head with the permissions the form sets', () => {
    const head: MemberFormValues = {
      role: 'head',
      settingsAccess: 'none',
      shopConfigAccess: 'none',
      expiresAt: '',
    }

    expect(memberChange(head, { ...head, role: 'org', settingsAccess: 'read' }, warsaw)).toEqual({
      role: 'org',
      settingsAccess: 'read',
    })
  })

  it('gives up on an expiry that names no instant', () => {
    expect(memberChange(org, { ...org, expiresAt: 'later' }, warsaw)).toBeNull()
  })
})
