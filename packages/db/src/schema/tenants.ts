import { sql } from 'drizzle-orm'
import { check, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from './columns'

export const tenants = pgTable(
  'tenants',
  {
    id: id(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    defaultLocale: text().notNull().default('pl'),
    timezone: text().notNull().default('Europe/Warsaw'),
    ...timestamps,
  },
  (t) => [check('tenants_slug_format', sql`${t.slug} ~ '^[a-z0-9-]{3,40}$'`)],
)
