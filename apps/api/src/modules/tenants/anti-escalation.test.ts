import { describe, expect, it } from 'vitest'
import { type TenantMembership } from '../../common/als/tenant-context.service'
import { assertMayGrant, assertMayGrantEdition, assertMayManage } from './anti-escalation'

const org = (overrides: Partial<TenantMembership> = {}): TenantMembership => ({
  id: 'actor',
  role: 'org',
  settingsAccess: 'write',
  brandingAccess: 'read',
  shopConfigAccess: 'none',
  expiresAt: null,
  ...overrides,
})
const head = org({ role: 'head' })
const none = { programAccess: 'none', websiteContentAccess: 'none', ticketsAccess: 'none' } as const

const code = (fn: () => void) => {
  try {
    fn()
    return 'allowed'
  } catch (error) {
    return (error as { code: string }).code
  }
}

describe('assertMayManage', () => {
  it('refuses the own membership, even to a head', () => {
    expect(code(() => assertMayManage(head, { id: 'actor', role: 'head' }))).toBe('member.self')
  })

  it('leaves heads to heads', () => {
    expect(code(() => assertMayManage(org(), { id: 't', role: 'head' }))).toBe('member.head-only')
    expect(code(() => assertMayManage(head, { id: 't', role: 'head' }))).toBe('allowed')
    expect(code(() => assertMayManage(org(), { id: 't', role: 'org' }))).toBe('allowed')
  })
})

describe('assertMayGrant', () => {
  it('lets a head grant anything', () => {
    expect(code(() => assertMayGrant(head, { role: 'head', shopConfigAccess: 'write' }))).toBe(
      'allowed',
    )
  })

  it('caps an org at their own permissions', () => {
    expect(code(() => assertMayGrant(org(), { brandingAccess: 'read' }))).toBe('allowed')
    expect(code(() => assertMayGrant(org(), { brandingAccess: 'write' }))).toBe('member.above-own')
    expect(code(() => assertMayGrant(org(), { shopConfigAccess: 'read' }))).toBe('member.above-own')
    expect(code(() => assertMayGrant(org(), { role: 'head' }))).toBe('member.above-own')
  })

  it("caps the expiry at the org's own", () => {
    const actor = org({ expiresAt: new Date('2027-01-01T00:00:00Z') })

    expect(code(() => assertMayGrant(actor, { expiresAt: '2026-12-31T00:00:00Z' }))).toBe('allowed')
    expect(code(() => assertMayGrant(actor, { expiresAt: '2027-02-01T00:00:00Z' }))).toBe(
      'member.expiry-after-own',
    )
    expect(code(() => assertMayGrant(actor, { expiresAt: null }))).toBe('member.expiry-after-own')
    expect(code(() => assertMayGrant(org(), { expiresAt: null }))).toBe('allowed')
  })
})

describe('assertMayGrantEdition', () => {
  it('caps an org at their own access to the edition', () => {
    const own = { ...none, programAccess: 'write' } as const

    expect(code(() => assertMayGrantEdition(org(), own, { ...none, programAccess: 'write' }))).toBe(
      'allowed',
    )
    expect(code(() => assertMayGrantEdition(org(), own, { ...none, ticketsAccess: 'read' }))).toBe(
      'member.above-own',
    )
    expect(code(() => assertMayGrantEdition(org(), null, { ...none, programAccess: 'read' }))).toBe(
      'member.above-own',
    )
    expect(code(() => assertMayGrantEdition(head, null, { ...none, ticketsAccess: 'write' }))).toBe(
      'allowed',
    )
  })
})
