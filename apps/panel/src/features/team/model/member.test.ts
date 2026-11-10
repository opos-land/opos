import { fromZonedWallTime } from '@opos/i18n'
import { describe, expect, it } from 'vitest'
import { canManage, memberChange, type MemberFormValues, memberName } from './member'

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

describe('canManage', () => {
  const writer = { settings: 'write', isHead: false } as const
  const head = { settings: 'write', isHead: true } as const

  it('lets a member with settings=write change another org', () => {
    expect(canManage(writer, { role: 'org' }, false)).toBe(true)
  })

  it('leaves a head to the heads', () => {
    expect(canManage(writer, { role: 'head' }, false)).toBe(false)
    expect(canManage(head, { role: 'head' }, false)).toBe(true)
  })

  it('never offers the own membership', () => {
    expect(canManage(head, { role: 'org' }, true)).toBe(false)
    expect(canManage(head, { role: 'head' }, true)).toBe(false)
  })

  it('offers nothing below settings=write', () => {
    expect(canManage({ settings: 'read', isHead: false }, { role: 'org' }, false)).toBe(false)
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
