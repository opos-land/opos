import { Injectable } from '@nestjs/common'
import { type EditionMember } from '@opos/contract'
import { accounts, editionMemberships, tenantMemberships } from '@opos/db'
import { and, asc, eq } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { type EditionAccess } from '../../common/permissions/permissions'

/** Edition-level permissions of the team, inside the tenant transaction. */
@Injectable()
export class EditionMembersRepository {
  constructor(private readonly context: TenantContextService) {}

  private select() {
    return this.context
      .tx()
      .select({
        tenantMembershipId: editionMemberships.tenantMembershipId,
        account: {
          id: accounts.id,
          email: accounts.email,
          firstName: accounts.firstName,
          lastName: accounts.lastName,
        },
        programAccess: editionMemberships.programAccess,
        websiteContentAccess: editionMemberships.websiteContentAccess,
        ticketsAccess: editionMemberships.ticketsAccess,
      })
      .from(editionMemberships)
      .innerJoin(tenantMemberships, eq(tenantMemberships.id, editionMemberships.tenantMembershipId))
      .innerJoin(accounts, eq(accounts.id, tenantMemberships.accountId))
  }

  async list(editionId: string): Promise<EditionMember[]> {
    return this.select()
      .where(eq(editionMemberships.editionId, editionId))
      .orderBy(asc(accounts.lastName), asc(accounts.email))
  }

  async find(editionId: string, tenantMembershipId: string): Promise<EditionMember | undefined> {
    const [row] = await this.select().where(
      and(
        eq(editionMemberships.editionId, editionId),
        eq(editionMemberships.tenantMembershipId, tenantMembershipId),
      ),
    )
    return row
  }

  async put(editionId: string, tenantMembershipId: string, access: EditionAccess) {
    await this.context
      .tx()
      .insert(editionMemberships)
      .values({ tenantId: this.context.tenant().id, editionId, tenantMembershipId, ...access })
      .onConflictDoUpdate({
        target: [editionMemberships.tenantMembershipId, editionMemberships.editionId],
        set: access,
      })
    return (await this.find(editionId, tenantMembershipId))!
  }

  async remove(editionId: string, tenantMembershipId: string) {
    await this.context
      .tx()
      .delete(editionMemberships)
      .where(
        and(
          eq(editionMemberships.editionId, editionId),
          eq(editionMemberships.tenantMembershipId, tenantMembershipId),
        ),
      )
  }
}
