import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * The slugs of deleted tenants. A trigger of `tenants` adds the slug of every tenant that is
 * deleted, and another refuses a slug found here, so the address of a deleted convention never
 * opens another one. A global table: no RLS, and no runtime role holds anything on it.
 */
export const retiredTenantSlugs = pgTable('retired_tenant_slugs', {
  slug: text().primaryKey(),
  retiredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})
