import { type Membership } from '@opos/contract'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  atLeast,
  membershipFor,
  setMemberships,
  tenantAccess,
  usePermissionStore,
} from './permissions'

const EDITION_2026 = '00000000-0000-4000-8000-000000002026'
const EDITION_2025 = '00000000-0000-4000-8000-000000002025'

const membership = (overrides: Partial<Membership> = {}): Membership => ({
  tenant: {
    id: '00000000-0000-4000-8000-00000000000a',
    slug: 'convention-a',
    name: 'Convention A',
  },
  role: 'org',
  settingsAccess: 'none',
  brandingAccess: 'none',
  shopConfigAccess: 'none',
  expiresAt: null,
  editions: [],
  ...overrides,
})

describe('atLeast', () => {
  it('ranks none < read < write', () => {
    expect(atLeast('write', 'read')).toBe(true)
    expect(atLeast('read', 'read')).toBe(true)
    expect(atLeast('read', 'write')).toBe(false)
    expect(atLeast('none', 'read')).toBe(false)
    expect(atLeast('none', 'none')).toBe(true)
  })
})

describe('tenantAccess', () => {
  it('lets a head do everything on both levels, whatever the row holds', () => {
    const access = tenantAccess(membership({ role: 'head' }))

    expect(access.isHead).toBe(true)
    expect(access.settings).toBe('write')
    expect(access.shop).toBe('write')
    expect(access.edition(EDITION_2026)).toEqual({
      program: 'write',
      websiteContent: 'write',
      tickets: 'write',
    })
    expect(access.seesEdition(EDITION_2025)).toBe(true)
  })

  it("reads an org's tenant-level permissions from its membership", () => {
    const access = tenantAccess(membership({ settingsAccess: 'read', shopConfigAccess: 'write' }))

    expect(access.isHead).toBe(false)
    expect(access.settings).toBe('read')
    expect(access.shop).toBe('write')
  })

  it('never turns tenant-level permissions into edition-level access', () => {
    const access = tenantAccess(membership({ settingsAccess: 'write' }))

    expect(access.edition(EDITION_2026).program).toBe('none')
    expect(access.seesEdition(EDITION_2026)).toBe(true)
  })

  it('shows an org without settings only the editions it has access to', () => {
    const access = tenantAccess(
      membership({
        editions: [
          {
            editionId: EDITION_2026,
            editionSlug: '2026',
            programAccess: 'write',
            websiteContentAccess: 'none',
            ticketsAccess: 'none',
          },
        ],
      }),
    )

    expect(access.edition(EDITION_2026).program).toBe('write')
    expect(access.seesEdition(EDITION_2026)).toBe(true)
    expect(access.seesEdition(EDITION_2025)).toBe(false)
  })

  it('hides an edition whose row grants nothing', () => {
    const access = tenantAccess(
      membership({
        editions: [
          {
            editionId: EDITION_2026,
            editionSlug: '2026',
            programAccess: 'none',
            websiteContentAccess: 'none',
            ticketsAccess: 'none',
          },
        ],
      }),
    )

    expect(access.seesEdition(EDITION_2026)).toBe(false)
  })
})

describe('the permission store', () => {
  beforeEach(() => setMemberships(null))

  it('is empty until the memberships arrive', () => {
    expect(usePermissionStore.getState().memberships).toBeNull()
    expect(membershipFor(usePermissionStore.getState().memberships, 'convention-a')).toBeUndefined()
  })

  it('finds the membership by the tenant slug', () => {
    setMemberships([
      membership(),
      membership({ tenant: { id: 'b', slug: 'convention-b', name: 'B' } }),
    ])
    const { memberships } = usePermissionStore.getState()

    expect(membershipFor(memberships, 'convention-b')?.tenant.name).toBe('B')
    expect(membershipFor(memberships, 'convention-c')).toBeUndefined()
  })
})
