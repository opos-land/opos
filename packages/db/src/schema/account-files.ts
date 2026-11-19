import { foreignKey, index, pgTable, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { fileColumns, fileConstraints } from './files'

/** An account's file: global, as `accounts` is, and gone with its account. */
export const accountFiles = pgTable(
  'account_files',
  {
    ...fileColumns(),
    accountId: uuid().notNull(),
  },
  (t) => [
    index('account_files_account_idx').on(t.accountId),
    foreignKey({
      name: 'account_files_account_fk',
      columns: [t.accountId],
      foreignColumns: [accounts.id],
    }).onDelete('cascade'),
    ...fileConstraints('account_files', t),
  ],
)
