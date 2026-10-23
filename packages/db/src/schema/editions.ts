import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
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
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
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
    uniqueIndex('editions_one_active_per_tenant')
      .on(t.tenantId)
      .where(sql`${t.isActive}`),
    check('editions_ends_after_start', sql`${t.endsAt} > ${t.startsAt}`),
  ],
)
