import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common'
import {
  type AdminAction,
  type AdminTenant,
  type AdminTenantDetails,
  type CreateTenant,
} from '@opos/contract'
import {
  accountRecoveryCodes,
  accounts,
  adminActions,
  adminDb,
  admins,
  createTenant,
  type Database,
  deleteTenant,
  recordAdminAction,
  renameTenant,
  restoreTenant,
  suspendTenant,
  TenantError,
  tenantMemberships,
  tenants,
} from '@opos/db'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { ApiError, notFound } from '../../common/errors/api-error'
import { ENV, type Env } from '../../config/env'

const tenantColumns = {
  id: tenants.id,
  slug: tenants.slug,
  name: tenants.name,
  defaultLocale: tenants.defaultLocale,
  timezone: tenants.timezone,
  suspendedAt: tenants.suspendedAt,
  createdAt: tenants.createdAt,
}

type TenantRow = { [K in keyof typeof tenantColumns]: (typeof tenants.$inferSelect)[K] }

const toTenant = ({ suspendedAt, createdAt, ...row }: TenantRow): AdminTenant => ({
  ...row,
  suspendedAt: suspendedAt?.toISOString() ?? null,
  createdAt: createdAt.toISOString(),
})

/** What a refusal of the tenant functions means to the admin application. */
function refusal(error: unknown): unknown {
  if (!(error instanceof TenantError)) return error
  switch (error.code) {
    case 'tenant.not-found':
      return notFound('tenant')
    case 'account.not-found':
      return new ApiError(404, error.code, 'No account uses this email address')
    case 'tenant.not-suspended':
    case 'tenant.slug-taken':
    case 'tenant.slug-reserved':
    case 'tenant.slug-retired':
    case 'account.unconfirmed':
      return new ApiError(409, error.code, error.message)
    // The contract refuses these shapes before a handler runs.
    default:
      return new ApiError(400, 'request.invalid', error.message)
  }
}

/**
 * The only code on the opos_admin role, which bypasses RLS and may create, suspend and delete
 * tenants (docs/adr/0030-guard-admin-access-with-its-own-role-application-and-second-factor.md).
 * It never opens a tenant transaction. Every method that changes anything writes its entry of
 * the log in the same transaction, so the entry commits with the action or not at all; a method
 * is called only behind @RequireAdmin, with the admin of the request.
 */
@Injectable()
export class AdminDbService implements OnApplicationShutdown {
  private readonly db: Database

  constructor(@Inject(ENV) env: Pick<Env, 'DATABASE_ADMIN_URL'>) {
    if (!env.DATABASE_ADMIN_URL) {
      throw new Error('The admin module needs DATABASE_ADMIN_URL, the connection of opos_admin')
    }
    this.db = adminDb(env.DATABASE_ADMIN_URL)
  }

  async onApplicationShutdown() {
    await this.db.$client.end()
  }

  /**
   * The grant of the admin role the account holds, if any: whether the account has two-factor
   * authentication on, and whether the grant still names that factor. The role holds only with
   * the second factor it was granted with.
   */
  async grantOf(accountId: string): Promise<{ mfaEnabled: boolean; bound: boolean } | undefined> {
    const [grant] = await this.db
      .select({
        mfaEnabled: sql<boolean>`${accounts.mfaEnabledAt} is not null`,
        bound: sql<boolean>`coalesce(${admins.mfaEnabledAt} = ${accounts.mfaEnabledAt}, false)`,
      })
      .from(admins)
      .innerJoin(accounts, eq(accounts.id, admins.accountId))
      .where(eq(admins.accountId, accountId))
    return grant
  }

  /** Every tenant, by name. Nothing of a tenant's team, editions or programme. */
  async tenants(): Promise<AdminTenant[]> {
    const rows = await this.db
      .select(tenantColumns)
      .from(tenants)
      .orderBy(asc(tenants.name), asc(tenants.slug))
    return rows.map(toTenant)
  }

  /** A tenant with its heads, by name and email address, for the admin to reach them. */
  async tenant(id: string): Promise<AdminTenantDetails> {
    const [row] = await this.db.select(tenantColumns).from(tenants).where(eq(tenants.id, id))
    if (!row) throw notFound('tenant')
    const heads = await this.db
      .select({
        accountId: accounts.id,
        email: accounts.email,
        firstName: accounts.firstName,
        lastName: accounts.lastName,
      })
      .from(tenantMemberships)
      .innerJoin(accounts, eq(accounts.id, tenantMemberships.accountId))
      .where(and(eq(tenantMemberships.tenantId, id), eq(tenantMemberships.role, 'head')))
      .orderBy(asc(accounts.email))
    return { ...toTenant(row), heads }
  }

  /** Creates a tenant with its first head, an account whose email address is confirmed. */
  async createTenant(input: CreateTenant, adminAccountId: string): Promise<AdminTenantDetails> {
    const id = await this.db
      .transaction(async (tx) => {
        const created = await createTenant(tx, input)
        await recordAdminAction(tx, {
          action: 'tenant.create',
          adminAccountId,
          tenant: { id: created.id, slug: created.slug },
          accountId: created.headAccountId,
        })
        return created.id
      })
      .catch((error: unknown) => {
        throw refusal(error)
      })
    return this.tenant(id)
  }

  /** Moves a tenant to another slug; the slug it already has changes nothing and leaves no entry. */
  async renameTenant(id: string, slug: string, adminAccountId: string): Promise<AdminTenant> {
    return this.change(id, async (tx, current) => {
      if (current.slug === slug) return
      const renamed = await renameTenant(tx, { id, newSlug: slug })
      await recordAdminAction(tx, { action: 'tenant.rename', adminAccountId, tenant: renamed })
    })
  }

  /** Suspends or restores a tenant; one already in that state stays as it was, with no entry. */
  async setSuspended(id: string, suspended: boolean, adminAccountId: string): Promise<AdminTenant> {
    return this.change(id, async (tx) => {
      const { changed, ...tenant } = await (suspended ? suspendTenant : restoreTenant)(tx, id)
      if (!changed) return
      await recordAdminAction(tx, {
        action: suspended ? 'tenant.suspend' : 'tenant.restore',
        adminAccountId,
        tenant,
      })
    })
  }

  /** Deletes a suspended tenant with everything it owns, for good; the accounts stay. */
  async deleteTenant(id: string, adminAccountId: string): Promise<void> {
    await this.db
      .transaction(async (tx) => {
        const tenant = await deleteTenant(tx, id)
        await recordAdminAction(tx, { action: 'tenant.delete', adminAccountId, tenant })
      })
      .catch((error: unknown) => {
        throw refusal(error)
      })
  }

  /**
   * The start of a reset of two-factor authentication: finds the account by its confirmed email
   * address, refuses an admin and an account with two-factor authentication off, and commits the
   * entry of the log. The entry comes first because the reset then acts in Supabase Auth, outside
   * any transaction: an entry may stand for a reset that failed, never the reverse.
   */
  async beginTwoFactorReset(address: string, adminAccountId: string) {
    const email = address.trim().toLowerCase()
    return this.db.transaction(async (tx) => {
      const [account] = await tx
        .select({
          id: accounts.id,
          email: accounts.email,
          locale: accounts.locale,
          emailConfirmedAt: accounts.emailConfirmedAt,
          mfaEnabledAt: accounts.mfaEnabledAt,
        })
        .from(accounts)
        .where(eq(accounts.email, email))
      if (!account) {
        throw new ApiError(404, 'account.not-found', 'No account uses this email address')
      }
      if (!account.emailConfirmedAt) {
        throw new ApiError(409, 'account.unconfirmed', 'The email address is not confirmed')
      }
      // The API never resets an admin: the role is taken away first, by the script, whatever
      // became of the grant since.
      const [admin] = await tx
        .select({ accountId: admins.accountId })
        .from(admins)
        .where(eq(admins.accountId, account.id))
      if (admin) throw new ApiError(409, 'account.is-admin', 'The account holds the admin role')
      if (!account.mfaEnabledAt) {
        throw new ApiError(409, 'mfa.not-enabled', 'Two-factor authentication is not on')
      }
      await recordAdminAction(tx, {
        action: 'account.reset-2fa',
        adminAccountId,
        accountId: account.id,
      })
      return { id: account.id, email: account.email, locale: account.locale }
    })
  }

  /** The unused recovery codes go with the factors; a used one stays, as a record. */
  async deleteUnusedRecoveryCodes(accountId: string): Promise<void> {
    await this.db
      .delete(accountRecoveryCodes)
      .where(
        and(eq(accountRecoveryCodes.accountId, accountId), isNull(accountRecoveryCodes.usedAt)),
      )
  }

  /**
   * The log of the admins' actions, newest first, a page of `limit` entries older than `before`.
   * An entry holds identifiers only; the names are read from the accounts as they are now, and an
   * account gone since shows its identifier alone.
   */
  async actions(page: { before?: string; limit: number }): Promise<AdminAction[]> {
    const actor = alias(accounts, 'actor')
    const subject = alias(accounts, 'subject')
    const rows = await this.db
      .select({
        id: adminActions.id,
        action: adminActions.action,
        adminAccountId: adminActions.adminAccountId,
        tenantId: adminActions.subjectTenantId,
        tenantSlug: adminActions.tenantSlug,
        accountId: adminActions.subjectAccountId,
        createdAt: adminActions.createdAt,
        actor: { email: actor.email, firstName: actor.firstName, lastName: actor.lastName },
        subject: {
          email: subject.email,
          firstName: subject.firstName,
          lastName: subject.lastName,
        },
      })
      .from(adminActions)
      .leftJoin(actor, eq(actor.id, adminActions.adminAccountId))
      .leftJoin(subject, eq(subject.id, adminActions.subjectAccountId))
      .where(
        page.before
          ? sql`(${adminActions.createdAt}, ${adminActions.id}) < (
              select created_at, id from admin_actions where id = ${page.before}
            )`
          : undefined,
      )
      .orderBy(desc(adminActions.createdAt), desc(adminActions.id))
      .limit(page.limit)

    const named = (
      id: string | null,
      account: { email: string; firstName: string | null; lastName: string | null } | null,
    ) =>
      id === null
        ? null
        : {
            id,
            email: account?.email ?? null,
            firstName: account?.firstName ?? null,
            lastName: account?.lastName ?? null,
          }
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      admin: named(row.adminAccountId, row.actor),
      tenant:
        row.tenantId !== null && row.tenantSlug !== null
          ? { id: row.tenantId, slug: row.tenantSlug }
          : null,
      account: named(row.accountId, row.subject),
      createdAt: row.createdAt.toISOString(),
    }))
  }

  /**
   * Runs a change of one tenant under a lock of its row, in one transaction with its entry of
   * the log, and answers the tenant as the change left it.
   */
  private async change(
    id: string,
    apply: (
      tx: Parameters<Parameters<Database['transaction']>[0]>[0],
      current: TenantRow,
    ) => Promise<void>,
  ): Promise<AdminTenant> {
    return this.db
      .transaction(async (tx) => {
        const [current] = await tx
          .select(tenantColumns)
          .from(tenants)
          .where(eq(tenants.id, id))
          .for('update')
        if (!current) throw notFound('tenant')
        await apply(tx, current)
        const [after] = await tx.select(tenantColumns).from(tenants).where(eq(tenants.id, id))
        return toTenant(after!)
      })
      .catch((error: unknown) => {
        throw refusal(error)
      })
  }
}
