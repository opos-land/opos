import { sql } from 'drizzle-orm'
import { type Database } from './client'

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Sets `app.tenant_id` for the rest of the transaction only (SET LOCAL, PLAN.md 4.6); every RLS
 * policy reads it, and a query without it fails. The same query asks who the connection is: RLS
 * holds only opos_app, so a pool pointed at any other role, or at an opos_app that bypasses RLS,
 * fails here instead of reading every tenant.
 */
export async function setTenantContext(tx: Transaction, tenantId: string) {
  const [row] = await tx.execute<{ role: string; bypasses: boolean }>(sql`
    select set_config('app.tenant_id', ${tenantId}, true), current_user as role,
      (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) as bypasses
  `)
  if (row?.role !== 'opos_app' || row.bypasses) {
    throw new Error(
      `A tenant transaction runs as ${row?.role}${row?.bypasses ? ', which bypasses RLS' : ''}; RLS holds only opos_app without BYPASSRLS (PLAN.md 4.6)`,
    )
  }
}
