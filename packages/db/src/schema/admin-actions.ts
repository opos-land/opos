import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { id } from './columns'
import { adminAction } from './enums'

/**
 * The log of the admins' actions: who, what, on which tenant or account, and when. Identifiers
 * and the tenant's slug, never an email address, and no foreign key, so an entry outlives its
 * tenant and its accounts. opos_admin adds entries and reads them; nothing changes or removes one.
 * A global table: no RLS.
 */
export const adminActions = pgTable(
  'admin_actions',
  {
    id: id(),
    action: adminAction().notNull(),
    // The admin who acted; null for a script.
    adminAccountId: uuid(),
    subjectTenantId: uuid(),
    // The tenant's slug as the action left it.
    tenantSlug: text(),
    // The account acted on; with `tenant.create`, the tenant's first head.
    subjectAccountId: uuid(),
    // The clock's time, not the start of the transaction: an entry cannot be dated back by
    // holding its transaction open.
    createdAt: timestamp({ withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    index('admin_actions_created_at_idx').on(t.createdAt),
    check(
      'admin_actions_subject_matches_action',
      sql`case
        when ${t.action} in ('tenant.create', 'tenant.rename', 'tenant.suspend', 'tenant.restore', 'tenant.delete')
          then ${t.subjectTenantId} is not null and ${t.tenantSlug} is not null
            and (${t.subjectAccountId} is not null) = (${t.action} = 'tenant.create')
        else ${t.subjectAccountId} is not null and ${t.subjectTenantId} is null and ${t.tenantSlug} is null
      end`,
    ),
    // The two scripts name no admin; every action of the admin application names its admin.
    check(
      'admin_actions_script_or_admin',
      sql`(${t.adminAccountId} is null) = (${t.action} in ('admin.grant', 'admin.revoke'))`,
    ),
  ],
)
