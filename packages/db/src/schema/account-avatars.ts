import { foreignKey, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { accountFiles } from './account-files'
import { accountProfiles } from './account-profiles'

/**
 * An account's avatar: the row points at the account's own file, and is there only while the
 * account has an avatar. A replaced avatar is a new row, never a changed one
 * (docs/specs/0016-public-profile.md, A1 and A4).
 */
export const accountAvatars = pgTable(
  'account_avatars',
  {
    accountId: uuid().primaryKey(),
    fileId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'account_avatars_profile_fk',
      columns: [t.accountId],
      foreignColumns: [accountProfiles.accountId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'account_avatars_file_fk',
      columns: [t.fileId, t.accountId],
      foreignColumns: [accountFiles.id, accountFiles.accountId],
    }).onDelete('cascade'),
  ],
)
