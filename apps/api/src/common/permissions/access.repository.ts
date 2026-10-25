import { Injectable } from '@nestjs/common'
import { editionMemberships, editions, tenantMemberships } from '@opos/db'
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { type TenantMembership, TenantContextService } from '../als/tenant-context.service'
import { type EditionAccess } from './permissions'
import { TENANT_WRITE_LOCK_TIMEOUT_MS, tenantWriteLockKey } from './tenant-write-lock'
import { ApiError } from '../errors/api-error'
import { postgresCode } from '../filters/http-exception.filter'

/** Reads the permissions of the request's account, inside its tenant transaction (RLS on). */
@Injectable()
export class AccessRepository {
  constructor(private readonly context: TenantContextService) {}

  /**
   * Waits for and takes the write lock of the tenant in context until the transaction ends
   * (PLAN.md 7.3); a membership read after it sees every member change the lock serialised.
   */
  async lockTenantWrites() {
    const tx = this.context.tx()
    const key = tenantWriteLockKey(this.context.tenant().id)
    // The wait is bounded for the lock alone; the row locks that follow keep the default.
    await tx.execute(
      sql`select set_config('lock_timeout', ${`${TENANT_WRITE_LOCK_TIMEOUT_MS}ms`}, true)`,
    )
    try {
      await tx.execute(sql`select pg_advisory_xact_lock(${key}::bigint)`)
    } catch (error) {
      if (postgresCode(error) !== '55P03') throw error
      throw new ApiError(503, 'request.busy', 'The tenant write lock is busy', undefined, {
        'Retry-After': '1',
      })
    }
    await tx.execute(sql`set local lock_timeout to default`)
  }

  /**
   * The account's membership in the tenant of the transaction, skipping an expired one. Expiry
   * is measured when the read runs, not when the transaction began, since a write may first wait
   * for the tenant's write lock.
   */
  async activeMembership(accountId: string): Promise<TenantMembership | null> {
    const [row] = await this.context
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
          or(
            isNull(tenantMemberships.expiresAt),
            gt(tenantMemberships.expiresAt, sql`statement_timestamp()`),
          ),
        ),
      )
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
