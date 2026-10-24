import { sql } from 'drizzle-orm'
import { check, foreignKey, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'
import { timestamps } from './columns'

export const accounts = pgTable(
  'accounts',
  {
    id: uuid().primaryKey(),
    email: text().notNull().unique('accounts_email_unique'),
    firstName: text(),
    lastName: text(),
    locale: text(),
    // auth.users.email_confirmed_at, mirrored by the auth.users triggers; null until confirmed.
    emailConfirmedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'accounts_auth_user_fk',
      columns: [t.id],
      foreignColumns: [authUsers.id],
    }).onDelete('cascade'),
    check('accounts_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
)
