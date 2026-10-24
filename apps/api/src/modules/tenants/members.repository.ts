import { Injectable } from '@nestjs/common'
import { type Member, type UpdateMember } from '@opos/contract'
import { accounts, editionMemberships, tenantMemberships } from '@opos/db'
import { asc, eq, inArray, sql } from 'drizzle-orm'
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

  /**
   * Locks the actor's and the target's rows for the rest of the transaction and returns them
   * fresh. Ordered by id, so two requests locking the same pair never deadlock; a concurrent
   * promotion or permission change waits, and the checks then run on what it committed.
   */
  async lockPair(actorId: string, targetId: string) {
    if (!isUuid(targetId)) return { actor: undefined, target: undefined }
    const rows = (
      await this.select()
        .where(inArray(tenantMemberships.id, [actorId, targetId]))
        .orderBy(asc(tenantMemberships.id))
        .for('update', { of: tenantMemberships })
    ).map(toMember)
    return {
      actor: rows.find((row) => row.id === actorId),
      target: rows.find((row) => row.id === targetId),
    }
  }

  /**
   * An expiry on a head violates tenant_memberships_head_never_expires, which the filter answers
   * with 400. Promoting to head clears the expiry, resets the tenant-level permissions and drops the
   * edition-level rows: a head holds everything, and stale grants would come back as access after
   * a demotion.
   */
  async update(id: string, changes: UpdateMember): Promise<Member> {
    if (Object.keys(changes).length === 0) return (await this.find(id))!
    const { expiresAt, ...rest } = changes
    const tx = this.context.tx()
    if (changes.role === 'head') {
      await tx.delete(editionMemberships).where(eq(editionMemberships.tenantMembershipId, id))
    }
    await tx
      .update(tenantMemberships)
      .set({
        ...rest,
        ...(changes.role === 'head'
          ? {
              settingsAccess: 'none',
              brandingAccess: 'none',
              shopConfigAccess: 'none',
              expiresAt: null,
            }
          : expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      })
      .where(eq(tenantMemberships.id, id))
    return (await this.find(id))!
  }

  async remove(id: string) {
    await this.context.tx().delete(tenantMemberships).where(eq(tenantMemberships.id, id))
  }
}
