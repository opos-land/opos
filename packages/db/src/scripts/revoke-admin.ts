import { parseArgs } from 'node:util'
import { AdminError, revokeAdmin } from '../admins'
import { migrationDb } from '../client'
import { migrationUrl } from '../migration-url'

const usage = 'Usage: pnpm db:admin:revoke --email <email>'

const { values } = parseArgs({ options: { email: { type: 'string' } } })

if (!values.email) {
  console.error(usage)
  process.exit(1)
}

const db = migrationDb(migrationUrl())

try {
  const { accountId } = await revokeAdmin(db, values.email)
  console.log(`Took the admin role away from account ${accountId}.`)
} catch (error) {
  if (!(error instanceof AdminError)) throw error
  console.error(`${error.code}: ${error.message}`)
  process.exitCode = 1
} finally {
  await db.$client.end()
}
