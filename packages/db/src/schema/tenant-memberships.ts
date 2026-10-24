import { sql } from 'drizzle-orm'
import { check, foreignKey, index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { id, timestamps } from './columns'
import { permissionLevel, tenantRole } from './enums'
import { tenants } from './tenants'

export const tenantMemberships = pgTable(
  'tenant_memberships',
  {
    id: id(),
    accountId: uuid().notNull(),
    tenantId: uuid().notNull(),
    role: tenantRole().notNull(),
    settingsAccess: permissionLevel().notNull().default('none'),
    brandingAccess: permissionLevel().notNull().default('none'),
    shopConfigAccess: permissionLevel().notNull().default('none'),
    expiresAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('tenant_memberships_account_tenant_unique').on(t.accountId, t.tenantId),
    unique('tenant_memberships_id_tenant_unique').on(t.id, t.tenantId),
    index('tenant_memberships_tenant_idx').on(t.tenantId),
    foreignKey({
      name: 'tenant_memberships_account_fk',
      columns: [t.accountId],
      foreignColumns: [accounts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'tenant_memberships_tenant_fk',
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    check(
      'tenant_memberships_head_never_expires',
      sql`${t.role} = 'org' or ${t.expiresAt} is null`,
    ),
    check(
      'tenant_memberships_head_holds_no_levels',
      sql`${t.role} = 'org' or (${t.settingsAccess} = 'none' and ${t.brandingAccess} = 'none' and ${t.shopConfigAccess} = 'none')`,
    ),
  ],
)
