import { sql } from 'drizzle-orm'
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { accountProfiles } from './account-profiles'
import { id } from './columns'
import { profileReportReason } from './enums'

/**
 * A notice from anyone that a published profile should not be there
 * (docs/specs/0016-public-profile.md, R1-R9). It keeps nothing of who sent it but the email
 * address they chose to give, with the language to answer in. The API adds a report and removes an
 * old one, and reads nothing a report says: only an admin does.
 */
export const profileReports = pgTable(
  'profile_reports',
  {
    id: id(),
    // The account of the reported profile.
    accountId: uuid().notNull(),
    reason: profileReportReason().notNull(),
    note: text(),
    email: text(),
    // The language of the page the report came from: the one its emails are written in.
    locale: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Null while the report is open.
    closedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: 'profile_reports_profile_fk',
      columns: [t.accountId],
      foreignColumns: [accountProfiles.accountId],
    }).onDelete('cascade'),
    // The open reports of a profile, which the limit of R4 counts.
    index('profile_reports_open_idx')
      .on(t.accountId)
      .where(sql`${t.closedAt} is null`),
    index('profile_reports_closed_at_idx').on(t.closedAt),
    check('profile_reports_note', sql`char_length(${t.note}) between 1 and 1000`),
    check(
      'profile_reports_email',
      sql`(${t.email} is null) = (${t.locale} is null) and char_length(${t.email}) between 3 and 320`,
    ),
  ],
)
