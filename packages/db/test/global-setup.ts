import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { migrationDb } from '../src/client'
import { migrationUrl } from '../src/migration-url'

export default async function setup() {
  const db = migrationDb(migrationUrl())
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) })
  } finally {
    await db.$client.end()
  }
}
