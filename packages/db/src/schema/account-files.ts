import { foreignKey, index, pgTable, unique, uuid } from 'drizzle-orm/pg-core'
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
    // What a row that points at a file names with it, so the file is its own account's.
    unique('account_files_id_account_unique').on(t.id, t.accountId),
    foreignKey({
      name: 'account_files_account_fk',
      columns: [t.accountId],
      foreignColumns: [accounts.id],
    }).onDelete('cascade'),
    ...fileConstraints('account_files', t),
  ],
)
