import { describe, expect, it } from 'vitest'
import { type TenantMembership } from '../../common/als/tenant-context.service'
import {
  assertMayGrant,
  assertMayGrantEdition,
  assertMayManage,
  assertWithinOwnExpiry,
} from './anti-escalation'

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
const plain = { settingsAccess: 'none', brandingAccess: 'none', shopConfigAccess: 'none' } as const

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
    expect(
      code(() => assertMayGrant(head, { role: 'head', shopConfigAccess: 'write' }, plain)),
    ).toBe('allowed')
  })

  it('caps an org at their own permissions', () => {
    expect(code(() => assertMayGrant(org(), { brandingAccess: 'read' }, plain))).toBe('allowed')
    expect(code(() => assertMayGrant(org(), { brandingAccess: 'write' }, plain))).toBe(
      'member.above-own',
    )
    expect(code(() => assertMayGrant(org(), { shopConfigAccess: 'read' }, plain))).toBe(
      'member.above-own',
    )
    expect(code(() => assertMayGrant(org(), { role: 'head' }, plain))).toBe('member.above-own')
  })

  it("caps the expiry at the org's own", () => {
    const actor = org({ expiresAt: new Date('2027-01-01T00:00:00Z') })

    expect(code(() => assertMayGrant(actor, { expiresAt: '2026-12-31T00:00:00Z' }, plain))).toBe(
      'allowed',
    )
    expect(code(() => assertMayGrant(actor, { expiresAt: '2027-02-01T00:00:00Z' }, plain))).toBe(
      'member.expiry-after-own',
    )
    expect(code(() => assertMayGrant(actor, { expiresAt: null }, plain))).toBe(
      'member.expiry-after-own',
    )
    expect(code(() => assertMayGrant(org(), { expiresAt: null }, plain))).toBe('allowed')
  })

  it('treats a value the member already holds as no grant', () => {
    const held = { ...plain, shopConfigAccess: 'write' } as const

    expect(code(() => assertMayGrant(org(), { shopConfigAccess: 'write' }, held))).toBe('allowed')
    expect(code(() => assertMayGrant(org(), { shopConfigAccess: 'none' }, held))).toBe('allowed')
  })
})

describe('assertMayGrantEdition, keeping access the target already holds', () => {
  it('lets an org change one field while keeping a higher one the target holds', () => {
    const own = { ...none, programAccess: 'write' } as const
    const current = { ...none, ticketsAccess: 'write' } as const

    expect(
      code(() =>
        assertMayGrantEdition(
          org(),
          own,
          { ...none, programAccess: 'write', ticketsAccess: 'write' },
          current,
        ),
      ),
    ).toBe('allowed')
  })
})

describe('assertMayGrantEdition', () => {
  it('caps an org at their own access to the edition', () => {
    const own = { ...none, programAccess: 'write' } as const

    expect(
      code(() => assertMayGrantEdition(org(), own, { ...none, programAccess: 'write' }, null)),
    ).toBe('allowed')
    expect(
      code(() => assertMayGrantEdition(org(), own, { ...none, ticketsAccess: 'read' }, null)),
    ).toBe('member.above-own')
    expect(
      code(() => assertMayGrantEdition(org(), null, { ...none, programAccess: 'read' }, null)),
    ).toBe('member.above-own')
    expect(
      code(() => assertMayGrantEdition(head, null, { ...none, ticketsAccess: 'write' }, null)),
    ).toBe('allowed')
  })
})

describe('assertWithinOwnExpiry', () => {
  const own = new Date('2027-01-01T00:00:00Z')

  it('keeps what an org with an expiry grants within their own access', () => {
    const actor = org({ expiresAt: own })

    expect(code(() => assertWithinOwnExpiry(actor, new Date('2026-12-01T00:00:00Z')))).toBe(
      'allowed',
    )
    expect(code(() => assertWithinOwnExpiry(actor, own))).toBe('allowed')
    expect(code(() => assertWithinOwnExpiry(actor, null))).toBe('member.outlives-own')
    expect(code(() => assertWithinOwnExpiry(actor, new Date('2027-02-01T00:00:00Z')))).toBe(
      'member.outlives-own',
    )
  })

  it('leaves heads and orgs without an expiry alone', () => {
    expect(code(() => assertWithinOwnExpiry(head, null))).toBe('allowed')
    expect(code(() => assertWithinOwnExpiry(org(), null))).toBe('allowed')
  })
})
