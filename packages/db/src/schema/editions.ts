import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps } from './columns'
import { tenants } from './tenants'

export const editions = pgTable(
  'editions',
  {
    id: id(),
    tenantId: uuid().notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    isActive: boolean().notNull().default(false),
    isPublished: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique('editions_tenant_slug_unique').on(t.tenantId, t.slug),
    unique('editions_id_tenant_unique').on(t.id, t.tenantId),
    uniqueIndex('editions_one_active_unique')
      .on(t.tenantId)
      .where(sql`${t.isActive}`),
    foreignKey({
      name: 'editions_tenant_fk',
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    check('editions_ends_after_start', sql`${t.endsAt} > ${t.startsAt}`),
  ],
)
