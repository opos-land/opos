import { sql } from 'drizzle-orm'

/**
 * The tenant of the open transaction, as set_config set it for RLS (PLAN.md 4.6). The queries of
 * AccessRepository and InvitationsRepository filter on it as well, so they hold even where RLS
 * does not. It is read from the transaction rather than from TenantContextService.tenant(): an
 * invitation runs in withTenant, whose request store holds no tenant.
 */
export const currentTenantId = sql`current_setting('app.tenant_id')::uuid`
