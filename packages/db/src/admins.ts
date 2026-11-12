import { eq, sql } from 'drizzle-orm'
import type { Database } from './client'
import { accounts, type adminAction, admins } from './schema'
import type { Executor } from './tenants'

export type AdminAction = (typeof adminAction.enumValues)[number]

export type AdminErrorCode =
  | 'account.not-found'
  | 'account.unconfirmed'
  | 'account.no-password'
  | 'account.not-admin'
  | 'mfa.not-enabled'

export class AdminError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AdminError'
  }
}

export interface AdminActionEntry {
  action: AdminAction
  /** The admin who acted; left out by the two scripts. */
  adminAccountId?: string
  /** The tenant acted on, with its slug as the action left it. */
  tenant?: { id: string; slug: string }
  /** The account acted on; with `tenant.create`, the tenant's first head. */
  accountId?: string
}

/**
 * Adds an entry to the log of the admins' actions on the caller's connection, so inside a
 * transaction it commits with its action or not at all. The statement names its columns: the
 * entry takes its identifier and its time from the database, and opos_admin may give neither.
 */
export async function recordAdminAction(db: Executor, entry: AdminActionEntry): Promise<void> {
  await db.execute(sql`
    insert into admin_actions
      (action, admin_account_id, subject_tenant_id, tenant_slug, subject_account_id)
    values (${entry.action}, ${entry.adminAccountId ?? null}, ${entry.tenant?.id ?? null},
      ${entry.tenant?.slug ?? null}, ${entry.accountId ?? null})
  `)
}

/**
 * Grants the admin role to the account with this address, and binds it to the second factor the
 * account has now: the grant keeps `accounts.mfa_enabled_at` as it found it, and the role holds
 * only while the two are equal. The account is confirmed, signs in with a password and has
 * two-factor authentication on. A grant of an account that is an admin already replaces the old
 * one. Runs as `postgres` alone, behind `pnpm db:admin:grant`: it reads `auth.users` for the
 * password, and no runtime role writes `admins`.
 */
export async function grantAdmin(db: Database, address: string) {
  const email = address.trim().toLowerCase()
  return db.transaction(async (tx) => {
    // The lock the mirror of auth.mfa_factors takes: a factor changing now waits for the grant,
    // so the grant binds to the factor it read.
    const [account] = await tx
      .select({
        id: accounts.id,
        emailConfirmedAt: accounts.emailConfirmedAt,
        mfaEnabledAt: accounts.mfaEnabledAt,
      })
      .from(accounts)
      .where(eq(accounts.email, email))
      .for('no key update')
    if (!account) throw new AdminError('account.not-found', `No account with the email ${email}`)
    if (!account.emailConfirmedAt) {
      throw new AdminError(
        'account.unconfirmed',
        `The account ${email} has not confirmed its email`,
      )
    }
    // The admin application signs in by password alone, which an account of Google sign-in lacks.
    const [user] = await tx.execute<{ has_password: boolean }>(sql`
      select coalesce(encrypted_password, '') <> '' as has_password
      from auth.users where id = ${account.id}
    `)
    if (!user?.has_password) {
      throw new AdminError('account.no-password', `The account ${email} has no password`)
    }
    if (!account.mfaEnabledAt) {
      throw new AdminError(
        'mfa.not-enabled',
        `The account ${email} has two-factor authentication off`,
      )
    }

    // The database copies the factor's timestamp: it holds microseconds, which a Date read here
    // would round away, and the role holds only while the two are equal.
    await tx.execute(sql`
      insert into admins (account_id, granted_at, mfa_enabled_at)
      select id, clock_timestamp(), mfa_enabled_at from accounts where id = ${account.id}
      on conflict (account_id) do update
        set granted_at = excluded.granted_at, mfa_enabled_at = excluded.mfa_enabled_at
    `)
    await recordAdminAction(tx, { action: 'admin.grant', accountId: account.id })
    return { accountId: account.id }
  })
}

/**
 * Takes the admin role away from the account with this address. Runs as `postgres` alone, behind
 * `pnpm db:admin:revoke`.
 */
export async function revokeAdmin(db: Database, address: string) {
  const email = address.trim().toLowerCase()
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.email, email))
    if (!account) throw new AdminError('account.not-found', `No account with the email ${email}`)

    const [revoked] = await tx
      .delete(admins)
      .where(eq(admins.accountId, account.id))
      .returning({ accountId: admins.accountId })
    if (!revoked) throw new AdminError('account.not-admin', `The account ${email} is no admin`)
    await recordAdminAction(tx, { action: 'admin.revoke', accountId: account.id })
    return revoked
  })
}
