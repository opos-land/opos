import { sql } from 'drizzle-orm'
import { type Database } from './client'

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Sets `app.tenant_id` for the rest of the transaction only (SET LOCAL, PLAN.md 4.6); every RLS
 * policy reads it, and a query without it fails.
 */
export const setTenantContext = (tx: Transaction, tenantId: string) =>
  tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`)
