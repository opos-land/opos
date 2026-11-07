import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll } from 'vitest'
import { migrationUrl } from '../src/migration-url'

// Every role connects to the host and database of DATABASE_MIGRATION_URL.
export const url = (user: string, password: string) => {
  const target = new URL(migrationUrl())
  target.username = user
  target.password = password
  return target.toString()
}

const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is missing from packages/db/.env; run pnpm infra:init`)
  return value
}

/** The passwords of the runtime roles, as pnpm db:roles set them. */
export const appPassword = required('OPOS_APP_PASSWORD')
export const appGlobalPassword = required('OPOS_APP_GLOBAL_PASSWORD')
/** The local stack gives Supabase's own roles the password of postgres. */
const localPassword = new URL(migrationUrl()).password

const connect = (connectionUrl: string) => postgres(connectionUrl, { max: 2, onnotice: () => {} })

/** The postgres role, as migrations and the scripts run. */
export const migrator = connect(migrationUrl())
const appUrl = url('opos_app', appPassword)
export const app = connect(appUrl)
export const global = connect(url('opos_app_global', appGlobalPassword))

/** A connection that has never run set_config, for checks that need a clean session. */
export const freshApp = () => postgres(appUrl, { max: 1, onnotice: () => {} })
export const authAdmin = connect(url('supabase_auth_admin', localPassword))
/** The image's only true superuser, for changes even postgres may not make (role ownership). */
export const supabaseAdmin = connect(url('supabase_admin', localPassword))

const tenantIds: string[] = []
/** Removes the tenant after the test file, like the tenants created by createTenant(). */
export const trackTenant = (id: string) => tenantIds.push(id)
const userIds: string[] = []

afterAll(async () => {
  await migrator`delete from tenants where id = any(${tenantIds}::uuid[])`
  await authAdmin`delete from auth.users where id = any(${userIds}::uuid[])`
  await Promise.all([migrator, app, global, authAdmin, supabaseAdmin].map((sql) => sql.end()))
})

export const unique = () => randomUUID().slice(0, 8)

/** A user as Supabase Auth writes it; confirmed unless the test needs an unconfirmed address. */
export async function createUser(
  meta: Record<string, string> = {},
  { confirmed = true }: { confirmed?: boolean } = {},
) {
  const id = randomUUID()
  const email = `User-${unique()}@Example.test`
  const confirmedAt = confirmed ? new Date() : null
  userIds.push(id)
  await authAdmin`
    insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
    values (${id}, ${email}, ${confirmedAt}, ${authAdmin.json(meta)})
  `
  return { id, email }
}

export async function createTenant() {
  const slug = `tenant-${unique()}`
  const head = await createUser()
  const id = await migrator.begin(async (sql) => {
    const [tenant] = await sql<{ id: string }[]>`
      insert into tenants (slug, name) values (${slug}, ${slug}) returning id
    `
    await sql`
      insert into tenant_memberships (account_id, tenant_id, role) values (${head.id}, ${tenant!.id}, 'head')
    `
    return tenant!.id
  })
  tenantIds.push(id)
  return { id, slug, headId: head.id }
}

export async function createEdition(tenantId: string, values: { isActive?: boolean } = {}) {
  const [edition] = await migrator<{ id: string }[]>`
    insert into editions (tenant_id, slug, name, starts_at, ends_at, is_active)
    values (${tenantId}, ${unique()}, 'Edition', '2026-06-01', '2026-06-03', ${values.isActive ?? false})
    returning id
  `
  return edition!.id
}

export async function createProgramItem(tenantId: string, editionId: string) {
  const [item] = await migrator<{ id: string }[]>`
    insert into program_items (tenant_id, edition_id, title, starts_at, ends_at)
    values (${tenantId}, ${editionId}, 'Item', '2026-06-01 10:00Z', '2026-06-01 11:00Z')
    returning id
  `
  return item!.id
}

export const inTenant = <T>(tenantId: string, run: (sql: postgres.TransactionSql) => Promise<T>) =>
  app.begin(async (sql) => {
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`
    return run(sql)
  })
