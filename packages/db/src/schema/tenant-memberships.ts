import { sql } from 'drizzle-orm'
import { check, index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { id, timestamps } from './columns'
import { permissionLevel, tenantRole } from './enums'
import { tenants } from './tenants'

export const tenantMemberships = pgTable(
  'tenant_memberships',
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
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
    check(
      'tenant_memberships_head_never_expires',
      sql`${t.role} = 'org' or ${t.expiresAt} is null`,
    ),
  ],
)
