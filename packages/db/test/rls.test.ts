import { beforeAll, describe, expect, it } from 'vitest'
import { createEdition, createTenant, freshApp, global, inTenant, migrator, superuser } from './db'

// Every covered table (PLAN.md 4.6) and the column that holds its tenant.
const covered = [
  ['tenants', 'id'],
  ['tenant_memberships', 'tenant_id'],
  ['editions', 'tenant_id'],
  ['edition_memberships', 'tenant_id'],
] as const

let a: Awaited<ReturnType<typeof createTenant>>
let b: Awaited<ReturnType<typeof createTenant>>

/** A tenant with a row in every covered table: its head membership, an edition and its access. */
async function populated() {
  const tenant = await createTenant()
  const edition = await createEdition(tenant.id)
  await migrator`
    insert into edition_memberships (tenant_id, tenant_membership_id, edition_id)
    select ${tenant.id}, id, ${edition} from tenant_memberships where tenant_id = ${tenant.id}
  `
  return tenant
}

beforeAll(async () => {
  ;[a, b] = await Promise.all([populated(), populated()])
})

describe('tenant isolation', () => {
  // On a session that never set app.tenant_id, only a policy without missing_ok raises this. A
  // reused session would hold '' and fail with a uuid error even under missing_ok.
  it.each(covered)('rejects a query on %s without a tenant context', async (table) => {
    const sql = freshApp()
    try {
      await expect(sql.unsafe(`select 1 from ${table}`)).rejects.toThrow(
        /unrecognized configuration parameter "app\.tenant_id"/,
      )
    } finally {
      await sql.end()
    }
  })

  it.each(covered)('shows only the rows of the tenant in context on %s', async (table, column) => {
    const rows = await inTenant(b.id, (sql) =>
      sql.unsafe<{ tenant: string }[]>(`select ${column} as tenant from ${table}`),
    )

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.tenant === b.id)).toBe(true)
  })

  // opos_app may not update tenant_id at all, so the privilege refuses before WITH CHECK would.
  it.each(covered.filter(([table]) => table !== 'tenants'))(
    'refuses to move a row of %s to another tenant',
    async (table) => {
      await expect(
        inTenant(b.id, (sql) =>
          sql.unsafe(`update ${table} set tenant_id = '${a.id}' where tenant_id = '${b.id}'`),
        ),
      ).rejects.toThrow(/permission denied/)
    },
  )

  // The tables opos_app inserts into; WITH CHECK refuses a row of another tenant in each.
  it('rejects an insert with another tenant id', async () => {
    const [membership] = await migrator<{ id: string }[]>`
      select id from tenant_memberships where tenant_id = ${a.id}
    `
    const [edition] = await migrator<{ id: string }[]>`
      select id from editions where tenant_id = ${a.id}
    `

    for (const statement of [
      `insert into editions (tenant_id, slug, name, starts_at, ends_at)
       values ('${a.id}', 'foreign', 'Foreign', '2026-06-01', '2026-06-03')`,
      `insert into edition_memberships (tenant_id, tenant_membership_id, edition_id)
       values ('${a.id}', '${membership!.id}', '${edition!.id}')`,
    ]) {
      await expect(inTenant(b.id, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /row-level security/,
      )
    }
  })

  it.each(['anon', 'authenticated'])('gives %s no access to public tables', async (role) => {
    for (const table of [
      'accounts',
      'tenants',
      'tenant_memberships',
      'editions',
      'edition_memberships',
    ]) {
      await expect(
        superuser.begin(async (sql) => {
          await sql.unsafe(`set local role ${role}`)
          await sql.unsafe(`select 1 from public.${table} limit 1`)
        }),
      ).rejects.toThrow(/permission denied/)
    }
  })
})

describe('runtime privileges', () => {
  it.each(covered)('lets opos_app_global only read %s', async (table, column) => {
    await global.unsafe(`select ${column} from ${table} limit 1`)
    for (const statement of [
      `insert into ${table} select * from ${table} where false`,
      `update ${table} set ${column} = ${column} where false`,
      `delete from ${table} where false`,
    ]) {
      await expect(global.unsafe(statement)).rejects.toThrow(/permission denied/)
    }
  })

  it('lets opos_app create no tenant and no membership, and delete no tenant', async () => {
    // An account without a membership in b: only the missing privilege can refuse it.
    const [outsider] = await migrator<{ account_id: string }[]>`
      select account_id from tenant_memberships where tenant_id = ${a.id}
    `
    for (const statement of [
      `insert into tenants (slug, name) values ('rls-foreign', 'Foreign')`,
      `insert into tenant_memberships (account_id, tenant_id, role)
       values ('${outsider!.account_id}', '${b.id}', 'org')`,
      `delete from tenants where id = '${b.id}'`,
    ]) {
      await expect(inTenant(b.id, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /permission denied/,
      )
    }
  })

  it('lets opos_app update only the columns the API changes', async () => {
    await inTenant(b.id, (sql) => sql`update tenants set name = name where id = ${b.id}`)
    for (const statement of [
      'update tenants set slug = slug',
      'update tenant_memberships set account_id = account_id',
      'update edition_memberships set tenant_membership_id = tenant_membership_id',
      'update editions set id = id',
    ]) {
      await expect(inTenant(b.id, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /permission denied/,
      )
    }
  })
})
