import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TenantContextService } from '../src/common/als/tenant-context.service'
import { AccessRepository } from '../src/common/permissions/access.repository'
import { InvitationsRepository } from '../src/modules/tenants/invitations.repository'
import { deleteCreatedAccounts } from './auth'
import {
  addEdition,
  addOrg,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  type Member,
  storedMembership,
  tenantWithHead,
  withoutRls,
} from './tenants'

// The reads that decide which tenant a request acts in filter on the tenant of the transaction
// themselves, besides RLS (PLAN.md 4.6): these run them on a connection that bypasses RLS.

let a: Awaited<ReturnType<typeof tenantWithHead>>
let b: Awaited<ReturnType<typeof tenantWithHead>>
let orgOfB: Member

beforeAll(async () => {
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
  orgOfB = await member()
  await addOrg(b.id, orgOfB, { settings: 'write' })
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
})

/** A TenantContextService whose transaction is `tx`, as the repositories read it. */
const contextOf = (tx: unknown) => ({ tx: () => tx }) as unknown as TenantContextService

describe('activeMembership', () => {
  it("finds no membership of another tenant in this tenant's transaction", async () => {
    const found = await withoutRls(a.id, (tx) =>
      new AccessRepository(contextOf(tx)).activeMembership(orgOfB.id),
    )
    expect(found).toBeNull()
  })

  it('finds the membership of the tenant in context', async () => {
    const found = await withoutRls(b.id, (tx) =>
      new AccessRepository(contextOf(tx)).activeMembership(orgOfB.id),
    )
    expect(found).toMatchObject({ role: 'org', settingsAccess: 'write' })
  })
})

describe('editionAccess', () => {
  it("finds no edition of another tenant in this tenant's transaction", async () => {
    const editionOfB = await addEdition(b.id)
    const headOfA = (await storedMembership(a.id, a.head.id))!.id
    const found = await withoutRls(a.id, (tx) =>
      new AccessRepository(contextOf(tx)).editionAccess(headOfA, editionOfB),
    )
    expect(found).toBeUndefined()
  })
})

describe('the tenant of an invitation', () => {
  it.each(['a', 'b'] as const)('is the tenant of the transaction, %s', async (which) => {
    const tenant = which === 'a' ? a : b
    const found = await withoutRls(tenant.id, (tx) =>
      new InvitationsRepository(contextOf(tx)).tenant(),
    )
    expect(found?.id).toBe(tenant.id)
  })
})
