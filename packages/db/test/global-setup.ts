import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { migrationDb } from '../src/client'
import { migrationUrl } from '../src/migration-url'

export default async function setup() {
  const db = migrationDb(migrationUrl())
  try {
    await migrate(db, { migrationsFolder: 'drizzle' })
  } finally {
    await db.$client.end()
  }
}
