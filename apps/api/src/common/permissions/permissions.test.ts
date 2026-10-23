import { describe, expect, it } from 'vitest'
import { type TenantMembership } from '../als/tenant-context.service'
import { decideEdition, decideTenant, type EditionAccess } from './permissions'

const membership = (overrides: Partial<TenantMembership> = {}): TenantMembership => ({
  id: 'm',
  role: 'org',
  settingsAccess: 'none',
  brandingAccess: 'none',
  shopConfigAccess: 'none',
  expiresAt: null,
  ...overrides,
})

const edition = (overrides: Partial<EditionAccess> = {}): EditionAccess => ({
  programAccess: 'none',
  websiteContentAccess: 'none',
  ticketsAccess: 'none',
  ...overrides,
})

describe('decideTenant', () => {
  it('needs a membership', () => {
    expect(decideTenant(null)).toBe('forbidden')
    expect(decideTenant(membership())).toBe('allow')
  })

  it.each([
    ['none', 'read', 'forbidden'],
    ['read', 'read', 'allow'],
    ['read', 'write', 'forbidden'],
    ['write', 'write', 'allow'],
    ['write', 'read', 'allow'],
  ] as const)('settings=%s against %s -> %s', (held, required, decision) => {
    expect(decideTenant(membership({ settingsAccess: held }), 'settings', required)).toBe(decision)
  })

  it('lets a head through everything', () => {
    expect(decideTenant(membership({ role: 'head' }), 'shop', 'write')).toBe('allow')
  })
})

describe('decideEdition', () => {
  it('needs an edition membership unless the account is a head', () => {
    expect(decideEdition(membership(), null, 'program', 'read')).toBe('forbidden')
    expect(decideEdition(membership({ role: 'head' }), null, 'program', 'write')).toBe('allow')
    expect(decideEdition(null, edition({ programAccess: 'write' }), 'program', 'read')).toBe(
      'forbidden',
    )
  })

  it('ignores tenant-level permissions', () => {
    expect(
      decideEdition(membership({ settingsAccess: 'write' }), edition(), 'program', 'read'),
    ).toBe('forbidden')
  })

  it.each([
    ['read', 'read', 'allow'],
    ['read', 'write', 'forbidden'],
    ['write', 'write', 'allow'],
  ] as const)('tickets=%s against %s -> %s', (held, required, decision) => {
    expect(decideEdition(membership(), edition({ ticketsAccess: held }), 'tickets', required)).toBe(
      decision,
    )
  })
})
