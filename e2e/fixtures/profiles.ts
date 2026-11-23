import { type Database } from '@opos/db'
import { sql } from 'drizzle-orm'

/**
 * Publishes the profile of an account as its row, for a scenario that starts from a published
 * profile and is not about publishing one; returns the identifier of its page.
 */
export async function publishProfile(db: Database, accountId: string) {
  const [row] = await db.execute<{ public_id: string }>(sql`
    insert into account_profiles (account_id, published_at) values (${accountId}, now())
    on conflict (account_id) do update set published_at = now()
    returning public_id
  `)
  return row!.public_id
}
