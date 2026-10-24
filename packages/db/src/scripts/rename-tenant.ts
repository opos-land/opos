import { parseArgs } from 'node:util'
import { migrationDb } from '../client'
import { migrationUrl } from '../migration-url'
import { renameTenant, TenantError } from '../tenants'

const usage = 'Usage: pnpm db:tenant:rename --slug <current slug> --new-slug <new slug>'

const { values } = parseArgs({
  options: {
    slug: { type: 'string' },
    'new-slug': { type: 'string' },
  },
})

if (!values.slug || !values['new-slug']) {
  console.error(usage)
  process.exit(1)
}

const db = migrationDb(migrationUrl())

try {
  const tenant = await renameTenant(db, { slug: values.slug, newSlug: values['new-slug'] })
  console.log(`Tenant ${tenant.id} now has the slug ${tenant.slug}.`)
} catch (error) {
  if (!(error instanceof TenantError)) throw error
  console.error(`${error.code}: ${error.message}`)
  process.exitCode = 1
} finally {
  await db.$client.end()
}
