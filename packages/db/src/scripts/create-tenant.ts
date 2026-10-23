import { parseArgs } from 'node:util'
import { migrationDb } from '../client'
import { migrationUrl } from '../migration-url'
import { createTenant, CreateTenantError } from '../tenants'

const usage =
  'Usage: pnpm db:tenant:create --slug <slug> --name <name> --head-email <email> [--locale pl] [--timezone Europe/Warsaw]'

const { values } = parseArgs({
  options: {
    slug: { type: 'string' },
    name: { type: 'string' },
    'head-email': { type: 'string' },
    locale: { type: 'string' },
    timezone: { type: 'string' },
  },
})

if (!values.slug || !values.name || !values['head-email']) {
  console.error(usage)
  process.exit(1)
}

const db = migrationDb(migrationUrl())

try {
  const tenant = await createTenant(db, {
    slug: values.slug,
    name: values.name,
    headEmail: values['head-email'],
    defaultLocale: values.locale,
    timezone: values.timezone,
  })
  console.log(
    `Created tenant ${tenant.slug} (${tenant.id}) with its head account ${tenant.headAccountId}.`,
  )
} catch (error) {
  if (!(error instanceof CreateTenantError)) throw error
  console.error(`${error.code}: ${error.message}`)
  process.exitCode = 1
} finally {
  await db.$client.end()
}
