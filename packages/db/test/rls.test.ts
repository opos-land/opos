import { beforeAll, describe, expect, it } from 'vitest'
import {
  createEdition,
  createTenant,
  createUser,
  freshApp,
  global,
  inTenant,
  migrator,
  supabaseAdmin,
  superuser,
} from './db'

// Every covered table (PLAN.md 4.6) and the column that holds its tenant.
const covered = [
  ['tenants', 'id'],
  ['tenant_memberships', 'tenant_id'],
  ['editions', 'tenant_id'],
  ['edition_memberships', 'tenant_id'],
  ['accepted_invitations', 'tenant_id'],
] as const

let a: Awaited<ReturnType<typeof createTenant>>
let b: Awaited<ReturnType<typeof createTenant>>

/**
 * A tenant with a row in every covered table: its head membership, an edition, its access and an
 * accepted invitation.
 */
async function populated() {
  const tenant = await createTenant()
  const edition = await createEdition(tenant.id)
  await migrator`
    insert into edition_memberships (tenant_id, tenant_membership_id, edition_id)
    select ${tenant.id}, id, ${edition} from tenant_memberships where tenant_id = ${tenant.id}
  `
  await migrator`
    insert into accepted_invitations (tenant_id, jti) values (${tenant.id}, gen_random_uuid())
  `
  return tenant
}

beforeAll(async () => {
  ;[a, b] = await Promise.all([populated(), populated()])
})

describe('coverage', () => {
  // A new tenant table fails here until it joins `covered`, and with it every test below.
  it('lists every tenant table of the catalog', async () => {
    const tables = await migrator<{ relname: string }[]>`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and (c.relname = 'tenants' or exists (
          select 1 from pg_attribute a
          where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
        ))
      order by 1
    `
    expect(tables.map((t) => t.relname)).toEqual(covered.map(([table]) => table).sort())
  })
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

  // A role that may update tenant_id, created and dropped inside the test: only the policy's
  // WITH CHECK stands between it and moving a visible row to another tenant.
  it.each(covered.filter(([table]) => table !== 'tenants'))(
    'refuses through WITH CHECK to move a row of %s to another tenant',
    async (table) => {
      await expect(
        supabaseAdmin.begin(async (sql) => {
          await sql.unsafe(`
            create role rls_probe nologin;
            grant usage on schema public to rls_probe;
            grant select, update (tenant_id) on public.${table} to rls_probe;
            set local role rls_probe;
          `)
          await sql`select set_config('app.tenant_id', ${b.id}, true)`
          await sql.unsafe(`update ${table} set tenant_id = '${a.id}' where tenant_id = '${b.id}'`)
        }),
      ).rejects.toThrow(/new row violates row-level security policy/)
    },
  )

  it.each(covered)('updates no row of another tenant in %s', async (table, column) => {
    const [updatable] = await migrator<{ column: string }[]>`
      select a.attname as column
      from pg_attribute a
      where a.attrelid = ${'public.' + table}::regclass and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('opos_app', a.attrelid, a.attnum, 'UPDATE')
      order by a.attnum
      limit 1
    `
    if (!updatable) return
    const changed = await inTenant(b.id, (sql) =>
      sql.unsafe(
        `update ${table} set ${updatable.column} = ${updatable.column} where ${column} = '${a.id}'`,
      ),
    )
    expect(changed.count).toBe(0)
  })

  it.each(covered)('deletes no row of another tenant in %s', async (table, column) => {
    const [privilege] = await migrator<{ deletable: boolean }[]>`
      select has_table_privilege('opos_app', ${'public.' + table}, 'DELETE') as deletable
    `
    if (!privilege?.deletable) return
    const before = await migrator.unsafe(`select 1 from ${table} where ${column} = '${a.id}'`)
    const deleted = await inTenant(b.id, (sql) =>
      sql.unsafe(`delete from ${table} where ${column} = '${a.id}'`),
    )

    expect(deleted.count).toBe(0)
    const after = await migrator.unsafe(`select 1 from ${table} where ${column} = '${a.id}'`)
    expect(after.length).toBe(before.length)
  })

  // A pooled session keeps app.tenant_id as '' once a transaction has set it; a query outside a
  // transaction then fails on the uuid cast instead of reading the last tenant's rows.
  it('lets a session reused after a tenant transaction read no tenant', async () => {
    const sql = freshApp()
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${a.id}, true)`
        await tx`select 1 from editions`
      })
      await expect(sql`select id from editions`).rejects.toThrow(
        /invalid input syntax for type uuid/,
      )
    } finally {
      await sql.end()
    }
  })

  // The tables opos_app inserts into; WITH CHECK refuses a row of another tenant in each.
  it('rejects an insert with another tenant id', async () => {
    const [membership] = await migrator<{ id: string }[]>`
      select id from tenant_memberships where tenant_id = ${a.id}
    `
    const [edition] = await migrator<{ id: string }[]>`
      select id from editions where tenant_id = ${a.id}
    `
    // An account without a membership in a: only WITH CHECK can refuse it.
    const outsider = await createUser()

    for (const statement of [
      `insert into tenant_memberships (account_id, tenant_id, role)
       values ('${outsider.id}', '${a.id}', 'org')`,
      `insert into editions (tenant_id, slug, name, starts_at, ends_at)
       values ('${a.id}', 'foreign', 'Foreign', '2026-06-01', '2026-06-03')`,
      `insert into edition_memberships (tenant_id, tenant_membership_id, edition_id)
       values ('${a.id}', '${membership!.id}', '${edition!.id}')`,
      `insert into accepted_invitations (tenant_id, jti) values ('${a.id}', gen_random_uuid())`,
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
      'accepted_invitations',
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

  it('lets opos_app create and delete no tenant, and change no accepted invitation', async () => {
    for (const statement of [
      `insert into tenants (slug, name) values ('rls-foreign', 'Foreign')`,
      `delete from tenants where id = '${b.id}'`,
      `update accepted_invitations set jti = jti`,
      `delete from accepted_invitations`,
    ]) {
      await expect(inTenant(b.id, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /permission denied/,
      )
    }
  })

  it('lets opos_app add a member and record an accepted invitation', async () => {
    const account = await createUser()

    await inTenant(b.id, async (sql) => {
      await sql`
        insert into tenant_memberships (account_id, tenant_id, role)
        values (${account.id}, ${b.id}, 'org')
      `
      await sql`insert into accepted_invitations (tenant_id, jti) values (${b.id}, gen_random_uuid())`
    })
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
