import { foreignKey, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { id, timestamps } from './columns'

/**
 * The one-time recovery codes of two-factor authentication (PLAN.md 4.2, 7.12). Only the SHA-256
 * of a code is stored. A global table: no RLS, read and written only for the account in the
 * request store.
 */
export const accountRecoveryCodes = pgTable(
  'account_recovery_codes',
  {
    id: id(),
    accountId: uuid().notNull(),
    codeHash: text().notNull(),
    // Set once, when the code turns 2FA off; the one column opos_app updates.
    usedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // Also the index the lookup of a code among the account's own uses.
    unique('account_recovery_codes_account_hash_unique').on(t.accountId, t.codeHash),
    foreignKey({
      name: 'account_recovery_codes_account_fk',
      columns: [t.accountId],
      foreignColumns: [accounts.id],
    }).onDelete('cascade'),
  ],
)
