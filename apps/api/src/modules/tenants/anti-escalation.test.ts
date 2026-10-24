import { describe, expect, it } from 'vitest'
import { type TenantMembership } from '../../common/als/tenant-context.service'
import { type EditionAccess } from '../../common/permissions/permissions'
import {
  assertMayExtend,
  assertMayGrant,
  assertMayGrantEdition,
  assertMayManage,
  extendsAccess,
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

describe('extendsAccess', () => {
  const past = new Date('2026-01-01T00:00:00Z')
  const soon = new Date('2027-01-01T00:00:00Z')
  const later = new Date('2027-06-01T00:00:00Z')

  it('counts lifting an expiry and moving it later, a revival included', () => {
    expect(extendsAccess(soon, null)).toBe(true)
    expect(extendsAccess(soon, later)).toBe(true)
    expect(extendsAccess(past, soon)).toBe(true)
  })

  it('counts a date that does not compare as extending', () => {
    expect(extendsAccess(soon, new Date(Number.NaN))).toBe(true)
  })

  it('counts an earlier expiry, or a first one, as no grant', () => {
    expect(extendsAccess(later, soon)).toBe(false)
    expect(extendsAccess(soon, soon)).toBe(false)
    expect(extendsAccess(null, later)).toBe(false)
    expect(extendsAccess(null, null)).toBe(false)
  })
})

describe('assertMayExtend', () => {
  const rows = (entries: [string, Partial<EditionAccess>][]) =>
    new Map(entries.map(([id, access]) => [id, { ...none, ...access }]))
  const own = rows([['e1', { programAccess: 'read' }]])

  it('lets an org extend a member who holds no more than the org', () => {
    expect(
      code(() =>
        assertMayExtend(
          org(),
          own,
          { ...plain, settingsAccess: 'read' },
          rows([['e1', { programAccess: 'read' }]]),
        ),
      ),
    ).toBe('allowed')
  })

  it('refuses a member who holds more on the tenant level', () => {
    expect(
      code(() => assertMayExtend(org(), own, { ...plain, shopConfigAccess: 'read' }, rows([]))),
    ).toBe('member.above-own')
  })

  it('refuses a member who holds more in an edition, the org holding less or nothing there', () => {
    expect(
      code(() => assertMayExtend(org(), own, plain, rows([['e1', { programAccess: 'write' }]]))),
    ).toBe('member.above-own')
    expect(
      code(() => assertMayExtend(org(), own, plain, rows([['e2', { ticketsAccess: 'read' }]]))),
    ).toBe('member.above-own')
  })

  it('lets a head extend anyone', () => {
    expect(
      code(() =>
        assertMayExtend(
          head,
          rows([]),
          { ...plain, shopConfigAccess: 'write' },
          rows([['e1', { ticketsAccess: 'write' }]]),
        ),
      ),
    ).toBe('allowed')
  })
})
