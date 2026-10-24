import { randomUUID } from 'node:crypto'
import { createTenant, migrationDb, tenants } from '@opos/db'
import { inArray, sql } from 'drizzle-orm'
import { createAccount, signIn } from './auth'

// Tenants, editions and memberships for API tests, written as opos_migrator (PLAN.md 15.1).

const url = process.env.DATABASE_MIGRATION_URL
if (!url) throw new Error('DATABASE_MIGRATION_URL is missing from apps/api/.env.example')
const db = migrationDb(url)
const tenantIds: string[] = []

type Level = 'none' | 'read' | 'write'

export interface Member {
  id: string
  email: string
  token: string
}

export async function member(): Promise<Member> {
  const account = await createAccount()
  return { ...account, token: await signIn(account.email) }
}

export async function tenantWithHead() {
  const head = await member()
  const slug = `api-${randomUUID().slice(0, 8)}`
  const { id } = await createTenant(db, { slug, name: `Tenant ${slug}`, headEmail: head.email })
  tenantIds.push(id)
  return { id, slug, head }
}

export async function addEdition(tenantId: string) {
  const slug = randomUUID().slice(0, 8)
  const rows = await db.execute<{ id: string }>(sql`
    insert into editions (tenant_id, slug, name, starts_at, ends_at)
    values (${tenantId}, ${slug}, ${slug}, '2027-06-01', '2027-06-03') returning id
  `)
  return rows[0]!.id
}

export async function addOrg(
  tenantId: string,
  account: { id: string },
  access: { settings?: Level; expired?: boolean; expiresAt?: Date } = {},
) {
  const expiresAt = access.expired
    ? sql`now() - interval '1 day'`
    : access.expiresAt
      ? sql`${access.expiresAt.toISOString()}::timestamptz`
      : null
  const rows = await db.execute<{ id: string }>(sql`
    insert into tenant_memberships (account_id, tenant_id, role, settings_access, expires_at)
    values (${account.id}, ${tenantId}, 'org', ${access.settings ?? 'none'}, ${expiresAt})
    returning id
  `)
  return rows[0]!.id
}

export async function addEditionAccess(
  tenantId: string,
  membershipId: string,
  editionId: string,
  access: { program?: Level; tickets?: Level },
) {
  await db.execute(sql`
    insert into edition_memberships (tenant_id, tenant_membership_id, edition_id, program_access, tickets_access)
    values (${tenantId}, ${membershipId}, ${editionId}, ${access.program ?? 'none'}, ${access.tickets ?? 'none'})
  `)
}

export const countEditions = async (tenantId: string, slug: string) =>
  (
    await db.execute<{ count: number }>(
      sql`select count(*)::int as count from editions where tenant_id = ${tenantId} and slug = ${slug}`,
    )
  )[0]!.count

/** Tenants go first: a tenant's last head cannot be deleted while the tenant exists. */
export async function deleteCreatedTenants() {
  if (tenantIds.length > 0) await db.delete(tenants).where(inArray(tenants.id, tenantIds))
  tenantIds.length = 0
}

/** Whether accounts holds the email confirmation Supabase Auth recorded (PLAN.md 4.2). */
export const emailConfirmed = async (accountId: string) =>
  (
    await db.execute<{ confirmed: boolean }>(
      sql`select email_confirmed_at is not null as confirmed from accounts where id = ${accountId}`,
    )
  )[0]?.confirmed

export const closeTenantDb = () => db.$client.end()

/**
 * Runs `statement` in a transaction of its own and keeps it open, holding the locks it took,
 * until `commit` is called: lets a test interleave a request with a concurrent write.
 */
export async function holdOpen(
  statement: (sql: Awaited<ReturnType<typeof db.$client.reserve>>) => Promise<unknown>,
) {
  const sql = await db.$client.reserve()
  await sql`begin`
  await statement(sql)
  return async () => {
    await sql`commit`
    sql.release()
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const countHeads = async (tenantId: string) =>
  (
    await db.execute<{ count: number }>(
      sql`select count(*)::int as count from tenant_memberships where tenant_id = ${tenantId} and role = 'head'`,
    )
  )[0]!.count

export async function addHead(tenantId: string, account: { id: string }) {
  await db.execute(sql`
    insert into tenant_memberships (account_id, tenant_id, role) values (${account.id}, ${tenantId}, 'head')
  `)
}

/** The rows that reference an account, by table (PLAN.md 9, account deletion). */
export const accountRows = async (accountId: string) =>
  (
    await db.execute<{
      accounts: number
      tenantMemberships: number
      editionMemberships: number
    }>(sql`
      select
        (select count(*)::int from accounts where id = ${accountId}) as "accounts",
        (select count(*)::int from tenant_memberships where account_id = ${accountId}) as "tenantMemberships",
        (select count(*)::int from edition_memberships em
           join tenant_memberships tm on tm.id = em.tenant_membership_id
          where tm.account_id = ${accountId}) as "editionMemberships"
    `)
  )[0]!

/** The account's membership in the tenant and its edition rows, as stored. */
export async function storedMembership(tenantId: string, accountId: string) {
  const [membership] = await db.execute<{
    id: string
    role: string
    settingsAccess: string
    brandingAccess: string
    shopConfigAccess: string
    expiresAt: Date | null
  }>(sql`
    select id, role, settings_access as "settingsAccess", branding_access as "brandingAccess",
      shop_config_access as "shopConfigAccess", expires_at as "expiresAt"
    from tenant_memberships where tenant_id = ${tenantId} and account_id = ${accountId}
  `)
  if (!membership) return undefined
  const editions = await db.execute<{
    editionId: string
    programAccess: string
    websiteContentAccess: string
    ticketsAccess: string
  }>(sql`
    select edition_id as "editionId", program_access as "programAccess",
      website_content_access as "websiteContentAccess", tickets_access as "ticketsAccess"
    from edition_memberships where tenant_membership_id = ${membership.id}
  `)
  return { ...membership, editions: [...editions] }
}

export async function removeMembership(id: string) {
  await db.execute(sql`delete from tenant_memberships where id = ${id}`)
}

export async function deleteEdition(id: string) {
  await db.execute(sql`delete from editions where id = ${id}`)
}
