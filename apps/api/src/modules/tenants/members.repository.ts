import { Injectable } from '@nestjs/common'
import { type Member, type UpdateMember } from '@opos/contract'
import { accounts, tenantMemberships } from '@opos/db'
import { asc, eq, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { isUuid } from '../../common/uuid'

const columns = {
  id: tenantMemberships.id,
  account: {
    id: accounts.id,
    email: accounts.email,
    firstName: accounts.firstName,
    lastName: accounts.lastName,
  },
  role: tenantMemberships.role,
  settingsAccess: tenantMemberships.settingsAccess,
  brandingAccess: tenantMemberships.brandingAccess,
  shopConfigAccess: tenantMemberships.shopConfigAccess,
  expiresAt: tenantMemberships.expiresAt,
  expired: sql<boolean>`coalesce(${tenantMemberships.expiresAt} <= now(), false)`,
}

type Row = Omit<Member, 'expiresAt'> & { expiresAt: Date | null }

const toMember = ({ expiresAt, ...row }: Row): Member => ({
  ...row,
  expiresAt: expiresAt?.toISOString() ?? null,
})

/** The team of the tenant in context; RLS keeps every query inside it. */
@Injectable()
export class MembersRepository {
  constructor(private readonly context: TenantContextService) {}

  private select() {
    return this.context
      .tx()
      .select(columns)
      .from(tenantMemberships)
      .innerJoin(accounts, eq(accounts.id, tenantMemberships.accountId))
  }

  async list(): Promise<Member[]> {
    const rows = await this.select().orderBy(
      asc(tenantMemberships.role),
      asc(accounts.lastName),
      asc(accounts.email),
    )
    return rows.map(toMember)
  }

  /** Expired memberships included: an org may extend one. */
  async find(id: string): Promise<Member | undefined> {
    if (!isUuid(id)) return undefined
    const [row] = await this.select().where(eq(tenantMemberships.id, id))
    return row && toMember(row)
  }

  async update(id: string, changes: UpdateMember): Promise<Member> {
    const { expiresAt, ...rest } = changes
    await this.context
      .tx()
      .update(tenantMemberships)
      .set({
        ...rest,
        // A head never expires: promoting clears the expiry.
        ...(changes.role === 'head'
          ? { expiresAt: null }
          : expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      })
      .where(eq(tenantMemberships.id, id))
    return (await this.find(id))!
  }

  async remove(id: string) {
    await this.context.tx().delete(tenantMemberships).where(eq(tenantMemberships.id, id))
  }
}
