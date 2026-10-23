import { sql } from 'drizzle-orm'
import { check, foreignKey, pgTable, text, uuid } from 'drizzle-orm/pg-core'
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
