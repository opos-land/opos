import { sql } from 'drizzle-orm'
import { type Database } from './client'

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Sets `app.tenant_id` for the rest of the transaction only (SET LOCAL, PLAN.md 4.6); every RLS
 * policy reads it, and a query without it fails. The same query asks who the connection is: RLS
 * holds only opos_app, so a pool pointed at any other role, or at an opos_app that bypasses RLS
 * or inherits another role, fails here instead of reading every tenant.
 */
export async function setTenantContext(tx: Transaction, tenantId: string) {
  const [row] = await tx.execute<{ role: string; bypasses: boolean; inherits: boolean }>(sql`
    select set_config('app.tenant_id', ${tenantId}, true), current_user as role,
      (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) as bypasses,
      exists (select 1 from pg_auth_members where member = current_user::regrole) as inherits
  `)
  if (row?.role !== 'opos_app' || row.bypasses || row.inherits) {
    const why = row?.bypasses
      ? ', which bypasses RLS'
      : row?.inherits
        ? ', a member of other roles'
        : ''
    throw new Error(
      `A tenant transaction runs as ${row?.role}${why}; RLS holds only opos_app without BYPASSRLS and without other roles (PLAN.md 4.6)`,
    )
  }
}
