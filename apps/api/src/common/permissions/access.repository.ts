import { Injectable } from '@nestjs/common'
import { editionMemberships, editions, tenantMemberships } from '@opos/db'
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { type TenantMembership, TenantContextService } from '../als/tenant-context.service'
import { currentTenantId } from '../database/current-tenant'
import { type EditionAccess } from './permissions'
import { TENANT_WRITE_LOCK_TIMEOUT_MS, tenantWriteLockKey } from './tenant-write-lock'
import { tenantBusy } from './tenant-write-queue'
import { postgresCode } from '../filters/http-exception.filter'

/**
 * Reads the permissions of the request's account inside its tenant transaction; every query
 * filters on the transaction's tenant itself, besides RLS (PLAN.md 4.6).
 */
@Injectable()
export class AccessRepository {
  constructor(private readonly context: TenantContextService) {}

  /**
   * Waits for and takes the write lock of the tenant in context until the transaction ends
   * (PLAN.md 7.3); a membership read after it sees every member change the lock serialised.
   */
  async lockTenantWrites() {
    const tx = this.context.tx()
    const tenantId = this.context.tenant().id
    // The bound is for this wait alone: the transaction gets its own lock_timeout back after it.
    // `offset 0` keeps the subquery, so the old value is read before set_config replaces it.
    const [setting] = await tx.execute<{ previous: string }>(sql`
      select previous, set_config('lock_timeout', ${`${TENANT_WRITE_LOCK_TIMEOUT_MS}ms`}, true)
      from (select current_setting('lock_timeout') as previous offset 0) as current
    `)
    try {
      await tx.execute(sql`select pg_advisory_xact_lock(${tenantWriteLockKey(tenantId)}::bigint)`)
    } catch (error) {
      if (postgresCode(error) === '55P03') throw tenantBusy(tenantId)
      throw error
    }
    await tx.execute(sql`select set_config('lock_timeout', ${setting!.previous}, true)`)
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
          eq(tenantMemberships.tenantId, currentTenantId),
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
   * the edition does not exist in this tenant (another tenant's included), `null` when the
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
      .where(and(eq(editions.id, editionId), eq(editions.tenantId, currentTenantId)))
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
      .where(
        and(
          eq(editionMemberships.tenantMembershipId, membershipId),
          eq(editionMemberships.tenantId, currentTenantId),
        ),
      )
    return new Map(rows.map(({ editionId, ...access }) => [editionId, access]))
  }
}
