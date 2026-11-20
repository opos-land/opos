import { sql } from 'drizzle-orm'
import { check, foreignKey, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from './columns'
import { tenants } from './tenants'

/**
 * The seller's details of a convention, one row a tenant (docs/specs/0002-shop-setup.md): the
 * legal entity that runs the convention and sells its tickets, and the address buyers write to.
 * Each is empty until an org sets it; the convention sells in PLN.
 */
export const shopSellers = pgTable(
  'shop_sellers',
  {
    tenantId: uuid().primaryKey(),
    sellerName: text(),
    sellerAddress: text(),
    sellerRegistrationNumber: text(),
    contactEmail: text(),
    currency: text().notNull().default('PLN'),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'shop_sellers_tenant_fk',
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    check('shop_sellers_currency', sql`${t.currency} = 'PLN'`),
    check(
      'shop_sellers_not_blank',
      sql`btrim(${t.sellerName}) <> '' and btrim(${t.sellerAddress}) <> '' and btrim(${t.sellerRegistrationNumber}) <> '' and btrim(${t.contactEmail}) <> ''`,
    ),
  ],
)
