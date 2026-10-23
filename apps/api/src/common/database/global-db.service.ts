import { Inject, Injectable } from '@nestjs/common'
import { type Database, editionMemberships, editions, tenantMemberships, tenants } from '@opos/db'
import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import { type TenantInContext } from '../als/tenant-context.service'
import { GLOBAL_DB } from './tokens'

/**
 * The only code on the opos_app_global role, which bypasses RLS. Every method is a row of the
 * cross-tenant query table in PLAN.md 4.6; a new one needs a new row there first.
 */
@Injectable()
export class GlobalDbService {
  constructor(@Inject(GLOBAL_DB) private readonly db: Database) {}

  /** Tenant lookup by slug; only the public columns. */
  async tenantBySlug(slug: string): Promise<TenantInContext | undefined> {
    const [row] = await this.db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        defaultLocale: tenants.defaultLocale,
        timezone: tenants.timezone,
      })
      .from(tenants)
      .where(eq(tenants.slug, slug))
    return row
  }

  /** `GET /me/memberships`: the account's own, non-expired memberships in every tenant. */
  async membershipsOf(accountId: string) {
    const memberships = await this.db
      .select({
        id: tenantMemberships.id,
        tenant: { id: tenants.id, slug: tenants.slug, name: tenants.name },
        role: tenantMemberships.role,
        settingsAccess: tenantMemberships.settingsAccess,
        brandingAccess: tenantMemberships.brandingAccess,
        shopConfigAccess: tenantMemberships.shopConfigAccess,
        expiresAt: tenantMemberships.expiresAt,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(
        and(
          eq(tenantMemberships.accountId, accountId),
          or(isNull(tenantMemberships.expiresAt), gt(tenantMemberships.expiresAt, sql`now()`)),
        ),
      )
      .orderBy(asc(tenants.name))
    if (memberships.length === 0) return []

    const editionRows = await this.db
      .select({
        tenantMembershipId: editionMemberships.tenantMembershipId,
        editionId: editions.id,
        editionSlug: editions.slug,
        programAccess: editionMemberships.programAccess,
        websiteContentAccess: editionMemberships.websiteContentAccess,
        ticketsAccess: editionMemberships.ticketsAccess,
      })
      .from(editionMemberships)
      .innerJoin(editions, eq(editions.id, editionMemberships.editionId))
      .where(
        inArray(
          editionMemberships.tenantMembershipId,
          memberships.map((m) => m.id),
        ),
      )
      .orderBy(asc(editions.startsAt))

    return memberships.map(({ id, expiresAt, ...membership }) => ({
      ...membership,
      expiresAt: expiresAt?.toISOString() ?? null,
      editions: editionRows
        .filter((row) => row.tenantMembershipId === id)
        .map(({ tenantMembershipId: _, ...edition }) => edition),
    }))
  }
}
