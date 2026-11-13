import { grantAdmin, migrationDb, migrationUrl, revokeAdmin } from '@opos/db'
import { sql } from 'drizzle-orm'
import { createAccount, mintToken, originOf } from './auth'
import { addVerifiedFactor } from './tenants'

// Admins for the tests: the role is granted as `pnpm db:admin:grant` grants it, by postgres, to
// an account with a password and a verified factor.

const db = migrationDb(migrationUrl())

export const closeAdminDb = () => db.$client.end()

/** An account holding the admin role, on the factor it has now. */
export async function adminAccount(metadata: Record<string, string> = {}) {
  const account = await createAccount(metadata)
  await addVerifiedFactor(account.id)
  await grantAdmin(db, account.email)
  return account
}

/** Grants the role anew, as after a replaced factor. */
export const grant = (email: string) => grantAdmin(db, email)

export const revoke = (email: string) => revokeAdmin(db, email)

/** Removes every factor of the account, as turning two-factor authentication off does. */
export const removeFactors = (accountId: string) =>
  db.execute(sql`delete from auth.mfa_factors where user_id = ${accountId}`)

/**
 * A session token of the account as Supabase Auth issues it after password and code: `aal2`,
 * with both sign-in records `signedInSecondsAgo` old.
 */
export const sessionToken = (
  accountId: string,
  {
    signedInSecondsAgo = 0,
    aal = 'aal2',
  }: { signedInSecondsAgo?: number; aal?: 'aal1' | 'aal2' } = {},
) => {
  const timestamp = Math.floor(Date.now() / 1000) - signedInSecondsAgo
  return mintToken({
    sub: accountId,
    aal,
    providers: ['email'],
    amr: [
      { method: 'password', timestamp },
      ...(aal === 'aal2' ? [{ method: 'totp', timestamp }] : []),
    ],
  })
}

/** The headers the admin application's browser sends for `token`. */
export const adminHeaders = (token: string) => ({
  origin: originOf('admin'),
  cookie: `opos_admin_access=${token}`,
})

/** The entries of the log about a tenant or an account, oldest first. */
export async function loggedActions(subject: { tenantId?: string; accountId?: string }) {
  const rows = await db.execute<{
    action: string
    admin_account_id: string | null
    subject_tenant_id: string | null
    tenant_slug: string | null
    subject_account_id: string | null
  }>(sql`
    select action, admin_account_id, subject_tenant_id, tenant_slug, subject_account_id
    from admin_actions
    where ${subject.tenantId ? sql`subject_tenant_id = ${subject.tenantId}` : sql`subject_account_id = ${subject.accountId ?? null}`}
    order by created_at, id
  `)
  return [...rows]
}

export const countLoggedActions = async () =>
  (await db.execute<{ count: number }>(sql`select count(*)::int as count from admin_actions`))[0]!
    .count
