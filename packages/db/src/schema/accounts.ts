import { sql } from 'drizzle-orm'
import { check, foreignKey, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'
import { timestamps } from './columns'
import { nameOrder, theme } from './enums'

export const accounts = pgTable(
  'accounts',
  {
    id: uuid().primaryKey(),
    email: text().notNull().unique('accounts_email_unique'),
    firstName: text(),
    lastName: text(),
    // The three parts of the public name are optional; the order says where the nickname stands.
    nickname: text(),
    nameOrder: nameOrder().notNull().default('nickname-middle'),
    locale: text(),
    // The interface theme the account chose; null follows the system's.
    theme: theme(),
    // auth.users.email_confirmed_at, mirrored by the auth.users triggers; null until confirmed.
    emailConfirmedAt: timestamp({ withTimezone: true }),
    // Set while the user holds a verified auth.mfa_factors row, by the factor trigger; null when off.
    mfaEnabledAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'accounts_auth_user_fk',
      columns: [t.id],
      foreignColumns: [authUsers.id],
    }).onDelete('cascade'),
    check('accounts_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('accounts_nickname_length', sql`char_length(${t.nickname}) between 1 and 50`),
  ],
)
