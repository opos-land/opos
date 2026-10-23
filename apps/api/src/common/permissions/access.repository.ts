import { Injectable } from '@nestjs/common'
import { editionMemberships, editions, tenantMemberships } from '@opos/db'
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { type TenantMembership, TenantContextService } from '../als/tenant-context.service'
import { type EditionAccess } from './permissions'

/** Reads the permissions of the request's account, inside its tenant transaction (RLS on). */
@Injectable()
export class AccessRepository {
  constructor(private readonly context: TenantContextService) {}

  /** The account's membership in the tenant of the transaction, skipping an expired one. */
  async activeMembership(accountId: string): Promise<TenantMembership | null> {
    const [row] = await this.context
      .tx()
      .select({
        id: tenantMemberships.id,
        role: tenantMemberships.role,
        settingsAccess: tenantMemberships.settingsAccess,
        brandingAccess: tenantMemberships.brandingAccess,
        shopConfigAccess: tenantMemberships.shopConfigAccess,
      })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.accountId, accountId),
          or(isNull(tenantMemberships.expiresAt), gt(tenantMemberships.expiresAt, sql`now()`)),
        ),
      )
    return row ?? null
  }

  /** Whether the edition exists; RLS hides another tenant's edition. */
  async editionExists(editionId: string) {
    const rows = await this.context
      .tx()
      .select({ id: editions.id })
      .from(editions)
      .where(eq(editions.id, editionId))
    return rows.length > 0
  }

  async editionAccess(membershipId: string, editionId: string): Promise<EditionAccess | null> {
    const [row] = await this.context
      .tx()
      .select({
        programAccess: editionMemberships.programAccess,
        websiteContentAccess: editionMemberships.websiteContentAccess,
        ticketsAccess: editionMemberships.ticketsAccess,
      })
      .from(editionMemberships)
      .where(
        and(
          eq(editionMemberships.tenantMembershipId, membershipId),
          eq(editionMemberships.editionId, editionId),
        ),
      )
    return row ?? null
  }
}
