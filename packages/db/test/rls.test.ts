import { beforeAll, describe, expect, it } from 'vitest'
import { app, createEdition, createTenant, inTenant, migrator, superuser } from './db'

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
  it.each(covered)('rejects a query on %s without a tenant context', async (table) => {
    await expect(app.unsafe(`select 1 from ${table}`)).rejects.toThrow(
      /app\.tenant_id|invalid input syntax for type uuid/,
    )
  })

  it.each(covered)('shows only the rows of the tenant in context on %s', async (table, column) => {
    const rows = await inTenant(b.id, (sql) =>
      sql.unsafe<{ tenant: string }[]>(`select ${column} as tenant from ${table}`),
    )

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.tenant === b.id)).toBe(true)
  })

  it.each(covered.filter(([table]) => table !== 'tenants'))(
    'refuses to move a row of %s to another tenant',
    async (table) => {
      await expect(
        inTenant(b.id, (sql) =>
          sql.unsafe(`update ${table} set tenant_id = '${a.id}' where tenant_id = '${b.id}'`),
        ),
      ).rejects.toThrow(/row-level security/)
    },
  )

  it('rejects an insert with another tenant id', async () => {
    const a = await createTenant()
    const b = await createTenant()

    await expect(
      inTenant(
        b.id,
        (sql) => sql`
        insert into editions (tenant_id, slug, name, starts_at, ends_at)
        values (${a.id}, 'foreign', 'Foreign', '2026-06-01', '2026-06-03')
      `,
      ),
    ).rejects.toThrow(/row-level security/)
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
