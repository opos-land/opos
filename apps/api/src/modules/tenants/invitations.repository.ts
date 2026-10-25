import { Injectable } from '@nestjs/common'
import {
  acceptedInvitations,
  accounts,
  editionMemberships,
  editions,
  tenantMemberships,
  tenants,
} from '@opos/db'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { currentTenantId } from '../../common/database/current-tenant'
import { type InvitationGrant } from './anti-escalation'

/**
 * Invitations inside the tenant transaction (PLAN.md 7.7). Every query on `tenants`,
 * `tenant_memberships`, `editions` and `accepted_invitations` filters on the transaction's tenant
 * itself, besides RLS (PLAN.md 4.6).
 */
@Injectable()
export class InvitationsRepository {
  constructor(private readonly context: TenantContextService) {}

  /** The tenant in context, for a transaction opened with withTenant from a verified token. */
  async tenant() {
    const [row] = await this.context
      .tx()
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        defaultLocale: tenants.defaultLocale,
      })
      .from(tenants)
      .where(eq(tenants.id, currentTenantId))
    return row
  }

  /**
   * The account that uses `email`, only once that address is confirmed: an unconfirmed account
   * counts as none (PLAN.md 4.2). `email` is lowercase, like `accounts.email`.
   */
  async confirmedAccount(email: string) {
    const [row] = await this.context
      .tx()
      .select({ id: accounts.id, email: accounts.email, locale: accounts.locale })
      .from(accounts)
      .where(and(eq(accounts.email, email), isNotNull(accounts.emailConfirmedAt)))
    return row
  }

  /** Whether the account holds a membership in the tenant, an expired one included. */
  async isMember(accountId: string) {
    const rows = await this.context
      .tx()
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.accountId, accountId),
          eq(tenantMemberships.tenantId, currentTenantId),
        ),
      )
    return rows.length > 0
  }

  /**
   * The ids among `ids` that are editions of the tenant, locked against a delete until the
   * transaction ends, as EditionsRepository.lock does: the edition rows of the new membership are
   * then written without a foreign key violation. A delete committed while this waits leaves no
   * row, so that edition counts as missing.
   */
  async existingEditions(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await this.context
      .tx()
      .select({ id: editions.id })
      .from(editions)
      .where(and(inArray(editions.id, ids), eq(editions.tenantId, currentTenantId)))
      .for('key share')
    return new Set(rows.map((row) => row.id))
  }

  /** Whether the invitation with this token id has been accepted in the tenant. */
  async isAccepted(jti: string) {
    const rows = await this.context
      .tx()
      .select({ id: acceptedInvitations.id })
      .from(acceptedInvitations)
      .where(
        and(eq(acceptedInvitations.jti, jti), eq(acceptedInvitations.tenantId, currentTenantId)),
      )
    return rows.length > 0
  }

  /** Records the acceptance; a second one violates accepted_invitations_tenant_jti_unique. */
  async recordAcceptance(tenantId: string, jti: string) {
    await this.context.tx().insert(acceptedInvitations).values({ tenantId, jti })
  }

  /**
   * Creates the membership and its edition rows. A head takes no levels, no expiry and no edition
   * rows. A second membership of the account violates tenant_memberships_account_tenant_unique.
   * `tenantId` is the tenant of the transaction; WITH CHECK refuses any other.
   */
  async addMember(tenantId: string, accountId: string, grant: InvitationGrant): Promise<string> {
    const tx = this.context.tx()
    const head = grant.role === 'head'
    const [row] = await tx
      .insert(tenantMemberships)
      .values({
        accountId,
        tenantId,
        role: grant.role,
        settingsAccess: head ? 'none' : grant.settingsAccess,
        brandingAccess: head ? 'none' : grant.brandingAccess,
        shopConfigAccess: head ? 'none' : grant.shopConfigAccess,
        expiresAt: head ? null : grant.expiresAt,
      })
      .returning({ id: tenantMemberships.id })
    const membershipId = row!.id
    if (!head && grant.editions.length > 0) {
      await tx.insert(editionMemberships).values(
        grant.editions.map(({ editionId, ...access }) => ({
          tenantId,
          tenantMembershipId: membershipId,
          editionId,
          ...access,
        })),
      )
    }
    return membershipId
  }
}
