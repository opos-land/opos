import { sql } from 'drizzle-orm'

/**
 * The tenant of the open transaction, as set_config set it for RLS (PLAN.md 4.6). A read that
 * decides which tenant a request acts in filters on it as well, so it holds even where RLS does not.
 */
export const currentTenantId = sql`current_setting('app.tenant_id')::uuid`
