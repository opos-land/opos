import { foreignKey, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'

/**
 * The accounts holding the admin role. A row is written by `postgres` alone, behind
 * `db:admin:grant` and `db:admin:revoke`: no runtime role writes it. A global table: no RLS, and
 * only opos_admin reads it.
 */
export const admins = pgTable(
  'admins',
  {
    accountId: uuid().primaryKey(),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // accounts.mfa_enabled_at as the grant found it: the role holds only while the two are equal,
    // so a second factor turned on again or replaced since needs a new grant.
    mfaEnabledAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'admins_account_fk',
      columns: [t.accountId],
      foreignColumns: [accounts.id],
    }).onDelete('cascade'),
  ],
)
