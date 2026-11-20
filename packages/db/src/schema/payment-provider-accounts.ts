import { sql } from 'drizzle-orm'
import { check, foreignKey, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

/** The payment providers OPOS has a module of; the fake one is loaded on local and dev alone. */
export const PAYMENT_PROVIDERS = ['fake', 'przelewy24'] as const

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number]

/**
 * The convention's own account with a payment provider, one row a tenant
 * (docs/specs/0002-shop-setup.md). The credentials are sealed with a key the API alone holds and
 * leave it in no answer. Giving credentials again is a new row in place of the old: the row is
 * added and removed, never changed.
 */
export const paymentProviderAccounts = pgTable(
  'payment_provider_accounts',
  {
    tenantId: uuid().primaryKey(),
    provider: text().$type<PaymentProvider>().notNull(),
    credentials: text().notNull(),
    // Empty while the account is connected but not ready to sell.
    readyAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'payment_provider_accounts_tenant_fk',
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    check(
      'payment_provider_accounts_provider',
      sql`${t.provider} in (${sql.raw(PAYMENT_PROVIDERS.map((name) => `'${name}'`).join(', '))})`,
    ),
    check('payment_provider_accounts_credentials', sql`${t.credentials} <> ''`),
  ],
)
