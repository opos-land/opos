import { sql } from 'drizzle-orm'
import { check, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from './columns'

/**
 * Words a tenant slug never takes (PLAN.md 4.3): the platform's subdomains (PRODUCT.md 6) and the
 * panel's top-level paths (PLAN.md 8), which would hide a tenant's `/:tenantSlug` dashboard.
 */
export const RESERVED_TENANT_SLUGS = [
  'admin',
  'api',
  'auth',
  'invitation',
  'login',
  'panel',
  'scanner',
  'www',
] as const

export const tenants = pgTable(
  'tenants',
  {
    id: id(),
    slug: text().notNull().unique('tenants_slug_unique'),
    name: text().notNull(),
    defaultLocale: text().notNull().default('pl'),
    timezone: text().notNull().default('Europe/Warsaw'),
    ...timestamps,
  },
  (t) => [
    check('tenants_slug_format', sql`${t.slug} ~ '^[a-z0-9-]{3,40}$'`),
    // Literals, not parameters: DDL takes no placeholders, and the list is a constant above.
    check(
      'tenants_slug_not_reserved',
      sql`${t.slug} not in (${sql.raw(RESERVED_TENANT_SLUGS.map((slug) => `'${slug}'`).join(', '))})`,
    ),
  ],
)
