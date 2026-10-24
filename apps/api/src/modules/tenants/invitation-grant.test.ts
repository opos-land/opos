import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { claimsOf, grantFromClaims, grantOf } from './invitation-grant'

const tenantId = randomUUID()
const edition = {
  editionId: randomUUID(),
  programAccess: 'write',
  websiteContentAccess: 'none',
  ticketsAccess: 'read',
} as const

describe('grantOf', () => {
  it('makes an org with no access and no expiry of a bare email', () => {
    expect(grantOf({ email: 'x@example.test' })).toEqual({
      role: 'org',
      settingsAccess: 'none',
      brandingAccess: 'none',
      shopConfigAccess: 'none',
      expiresAt: null,
      editions: [],
    })
  })

  it('keeps what an org invitation sets', () => {
    const expiresAt = '2027-01-01T00:00:00.000Z'

    expect(
      grantOf({ email: 'x@example.test', settingsAccess: 'read', expiresAt, editions: [edition] }),
    ).toMatchObject({ settingsAccess: 'read', expiresAt: new Date(expiresAt), editions: [edition] })
  })

  it('drops the levels and edition rows of a head invitation', () => {
    expect(
      grantOf({
        email: 'x@example.test',
        role: 'head',
        shopConfigAccess: 'write',
        editions: [edition],
      }),
    ).toEqual({
      role: 'head',
      settingsAccess: 'none',
      brandingAccess: 'none',
      shopConfigAccess: 'none',
      expiresAt: null,
      editions: [],
    })
  })
})

describe('claimsOf and grantFromClaims', () => {
  it('carry a grant through the token unchanged', () => {
    const grant = grantOf({
      email: 'x@example.test',
      brandingAccess: 'read',
      expiresAt: '2027-01-01T00:00:00.000Z',
      editions: [edition],
    })
    const invitedBy = randomUUID()
    const claims = claimsOf({ tenantId, email: 'x@example.test', invitedBy }, grant)

    expect(claims).toMatchObject({
      tenantId,
      email: 'x@example.test',
      expiresAt: '2027-01-01T00:00:00.000Z',
      invitedBy,
    })
    expect(grantFromClaims(claims)).toEqual(grant)
  })
})
