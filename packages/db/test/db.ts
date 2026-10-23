import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll } from 'vitest'
import { migrationUrl } from '../src/migration-url'

// Every role connects to the host and database of DATABASE_MIGRATION_URL.
const url = (user: string, password: string) => {
  const target = new URL(migrationUrl())
  target.username = user
  target.password = password
  return target.toString()
}

const connect = (connectionUrl: string) => postgres(connectionUrl, { max: 2, onnotice: () => {} })

export const migrator = connect(migrationUrl())
const appUrl = process.env.DATABASE_URL ?? url('opos_app', 'opos')
export const app = connect(appUrl)
export const global = connect(url('opos_app_global', 'opos'))

/** A connection that has never run set_config, for checks that need a clean session. */
export const freshApp = () => postgres(appUrl, { max: 1, onnotice: () => {} })
export const authAdmin = connect(url('supabase_auth_admin', 'postgres'))
export const superuser = connect(url('postgres', 'postgres'))

const tenantIds: string[] = []
/** Removes the tenant after the test file, like the tenants created by createTenant(). */
export const trackTenant = (id: string) => tenantIds.push(id)
const userIds: string[] = []

afterAll(async () => {
  await migrator`delete from tenants where id = any(${tenantIds}::uuid[])`
  await authAdmin`delete from auth.users where id = any(${userIds}::uuid[])`
  await Promise.all([migrator, app, global, authAdmin, superuser].map((sql) => sql.end()))
})

export const unique = () => randomUUID().slice(0, 8)

export async function createUser(meta: Record<string, string> = {}) {
  const id = randomUUID()
  const email = `User-${unique()}@Example.test`
  userIds.push(id)
  await authAdmin`
    insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${email}, ${authAdmin.json(meta)})
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

export const inTenant = <T>(tenantId: string, run: (sql: postgres.TransactionSql) => Promise<T>) =>
  app.begin(async (sql) => {
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`
    return run(sql)
  })
