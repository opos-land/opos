import { timestamp, uuid } from 'drizzle-orm/pg-core'

export const id = () => uuid().primaryKey().defaultRandom()

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  // Kept current by the <table>_set_updated_at trigger.
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}
