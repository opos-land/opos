import { Injectable } from '@nestjs/common'
import { editionMemberships, editions, tenantMemberships } from '@opos/db'
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { type TenantMembership, TenantContextService } from '../als/tenant-context.service'
import { type EditionAccess } from './permissions'

/** Reads the permissions of the request's account, inside its tenant transaction (RLS on). */
@Injectable()
export class AccessRepository {
  constructor(private readonly context: TenantContextService) {}

  /**
   * The account's membership in the tenant of the transaction, skipping an expired one. With
   * `lock`, the read takes `for share`: it waits for a change to the row that is not committed yet
   * and returns the committed result, which then cannot change until this transaction ends.
   */
  async activeMembership(
    accountId: string,
    { lock = false }: { lock?: boolean } = {},
  ): Promise<TenantMembership | null> {
    const query = this.context
      .tx()
      .select({
        id: tenantMemberships.id,
        role: tenantMemberships.role,
        settingsAccess: tenantMemberships.settingsAccess,
        brandingAccess: tenantMemberships.brandingAccess,
        shopConfigAccess: tenantMemberships.shopConfigAccess,
        expiresAt: tenantMemberships.expiresAt,
      })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.accountId, accountId),
          or(isNull(tenantMemberships.expiresAt), gt(tenantMemberships.expiresAt, sql`now()`)),
        ),
      )
    const [row] = await (lock ? query.for('share') : query)
    return row ?? null
  }

  /**
   * The edition-level permissions of a membership in one edition, in one query: `undefined` when
   * the edition does not exist in this tenant (RLS hides another tenant's), `null` when the
   * membership has no row for it.
   */
  async editionAccess(
    membershipId: string,
    editionId: string,
  ): Promise<EditionAccess | null | undefined> {
    const [row] = await this.context
      .tx()
      .select({
        membershipId: editionMemberships.id,
        programAccess: editionMemberships.programAccess,
        websiteContentAccess: editionMemberships.websiteContentAccess,
        ticketsAccess: editionMemberships.ticketsAccess,
      })
      .from(editions)
      .leftJoin(
        editionMemberships,
        and(
          eq(editionMemberships.editionId, editions.id),
          eq(editionMemberships.tenantMembershipId, membershipId),
        ),
      )
      .where(eq(editions.id, editionId))
    if (!row) return undefined
    const { membershipId: rowId, programAccess, websiteContentAccess, ticketsAccess } = row
    if (!rowId || !programAccess || !websiteContentAccess || !ticketsAccess) return null
    return { programAccess, websiteContentAccess, ticketsAccess }
  }

  /** Every edition-level row of a membership, by edition id. */
  async editionRows(membershipId: string): Promise<Map<string, EditionAccess>> {
    const rows = await this.context
      .tx()
      .select({
        editionId: editionMemberships.editionId,
        programAccess: editionMemberships.programAccess,
        websiteContentAccess: editionMemberships.websiteContentAccess,
        ticketsAccess: editionMemberships.ticketsAccess,
      })
      .from(editionMemberships)
      .where(eq(editionMemberships.tenantMembershipId, membershipId))
    return new Map(rows.map(({ editionId, ...access }) => [editionId, access]))
  }
}
