import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createEdition,
  createProgramItem,
  createTenant,
  createUser,
  freshApp,
  global,
  inTenant,
  migrator,
  supabaseAdmin,
} from './db'
import { globalReads } from '../src/verify'

// Every covered table (PLAN.md 4.6) and the column that holds its tenant.
const covered = [
  ['tenants', 'id'],
  ['tenant_memberships', 'tenant_id'],
  ['editions', 'tenant_id'],
  ['edition_memberships', 'tenant_id'],
  ['accepted_invitations', 'tenant_id'],
  ['program_items', 'tenant_id'],
  ['program_item_speakers', 'tenant_id'],
  ['program_item_likes', 'tenant_id'],
] as const

class Rollback extends Error {}

let a: Awaited<ReturnType<typeof createTenant>>
let b: Awaited<ReturnType<typeof createTenant>>

/**
 * A tenant with a row in every covered table: its head membership, an edition, its access, an
 * accepted invitation, and a programme item with a speaker and a like.
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
  const item = await createProgramItem(tenant.id, edition)
  await migrator`
    insert into program_item_speakers (tenant_id, program_item_id, account_id)
    values (${tenant.id}, ${item}, ${tenant.headId})
  `
  await migrator`
    insert into program_item_likes (tenant_id, program_item_id, account_id)
    values (${tenant.id}, ${item}, ${tenant.headId})
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

  // PLAN.md 4.4: RLS filters on the tenant column of every query, so an index must start with it.
  it.each(covered)(
    'holds an index on %s that starts with its tenant column',
    async (table, column) => {
      const [row] = await migrator<{ indexed: boolean }[]>`
      select exists (
        select 1 from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
        where i.indrelid = ${'public.' + table}::regclass and a.attname = ${column}
      ) as indexed
    `
      expect(row!.indexed).toBe(true)
    },
  )
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
  // The role, its grants and the update live in one transaction that always rolls back, so a
  // policy that lets the update through leaves nothing behind for the next run.
  it.each(covered.filter(([table]) => table !== 'tenants'))(
    'refuses through WITH CHECK to move a row of %s to another tenant',
    async (table) => {
      let refusal: unknown
      await supabaseAdmin
        .begin(async (sql) => {
          await sql.unsafe(`
            create role rls_probe nologin;
            grant usage on schema public to rls_probe;
            grant select, update (tenant_id) on public.${table} to rls_probe;
            set local role rls_probe;
          `)
          await sql`select set_config('app.tenant_id', ${b.id}, true)`
          refusal = await sql
            .unsafe(`update ${table} set tenant_id = '${a.id}' where tenant_id = '${b.id}'`)
            .catch((error: unknown) => error)
          throw new Rollback()
        })
        .catch((error: unknown) => {
          if (!(error instanceof Rollback)) throw error
        })
      expect(String(refusal)).toMatch(/new row violates row-level security policy/)
    },
  )

  // The same on insert, for every table whether or not opos_app inserts into it yet. WITH CHECK
  // runs before the constraints, so the row needs nothing but its tenant.
  it.each(covered.filter(([table]) => table !== 'tenants'))(
    'refuses through WITH CHECK to insert a row of another tenant into %s',
    async (table) => {
      let refusal: unknown
      await supabaseAdmin
        .begin(async (sql) => {
          await sql.unsafe(`
            create role rls_probe nologin;
            grant usage on schema public to rls_probe;
            grant insert on public.${table} to rls_probe;
            set local role rls_probe;
          `)
          await sql`select set_config('app.tenant_id', ${b.id}, true)`
          refusal = await sql
            .unsafe(`insert into ${table} (tenant_id) values ('${a.id}')`)
            .catch((error: unknown) => error)
          throw new Rollback()
        })
        .catch((error: unknown) => {
          if (!(error instanceof Rollback)) throw error
        })
      expect(String(refusal)).toMatch(/new row violates row-level security policy/)
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
    const [item] = await migrator<{ id: string }[]>`
      select id from program_items where tenant_id = ${a.id}
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
      `insert into program_items (tenant_id, edition_id, title, starts_at, ends_at)
       values ('${a.id}', '${edition!.id}', 'Foreign', '2026-06-01', '2026-06-02')`,
      `insert into program_item_speakers (tenant_id, program_item_id, account_id)
       values ('${a.id}', '${item!.id}', '${outsider.id}')`,
      `insert into program_item_likes (tenant_id, program_item_id, account_id)
       values ('${a.id}', '${item!.id}', '${outsider.id}')`,
    ]) {
      await expect(inTenant(b.id, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /row-level security/,
      )
    }
  })

  it.each(['anon', 'authenticated', 'service_role'])(
    'gives %s no privilege on any public table',
    async (role) => {
      const held = await migrator`
        select c.relname, p.privilege
        from pg_class c
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
          and has_table_privilege(${role}, c.oid, p.privilege)
      `
      expect(held).toEqual([])
    },
  )

  it('revokes the Supabase API roles from the core tables in its own migration', async () => {
    const statements = readFileSync(
      join(import.meta.dirname, '../drizzle/0020_revoke_api_roles_from_core.sql'),
      'utf8',
    ).split('--> statement-breakpoint')
    const held = await migrator
      .begin(async (sql) => {
        // What a project that ran no db:roles before the first migration hands out by default.
        for (const role of ['anon', 'authenticated', 'service_role']) {
          await sql.unsafe(
            `grant all on accounts, tenants, tenant_memberships, editions, edition_memberships to ${role}`,
          )
        }
        for (const statement of statements) await sql.unsafe(statement)
        const rows = await sql`
          select r.role, c.relname from pg_class c
          cross join (values ('anon'), ('authenticated'), ('service_role')) r(role)
          where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
            and c.relname in ('accounts', 'tenants', 'tenant_memberships', 'editions', 'edition_memberships')
            and has_table_privilege(r.role, c.oid, 'SELECT')
        `
        throw Object.assign(new Rollback(), { rows })
      })
      .catch((error: unknown) => {
        if (error instanceof Rollback) return (error as Rollback & { rows: unknown[] }).rows
        throw error
      })
    expect(held).toEqual([])
  })
})

describe('runtime privileges', () => {
  // The columns the cross-tenant queries of PLAN.md 4.6 read: the list db:verify holds the role
  // to, so the grants the migrations made and that list cannot drift apart.
  const readsOf = (table: string) =>
    globalReads.filter((read) => read.startsWith(`${table}.`)).map((read) => read.split('.')[1]!)

  it.each(covered)('lets opos_app_global read only what its queries need of %s', async (table) => {
    const columns = await migrator<{ column: string }[]>`
      select a.attname as column from pg_attribute a
      where a.attrelid = ${'public.' + table}::regclass and a.attnum > 0 and not a.attisdropped
    `
    // `default values`, `= null` and a `false` condition reach the privilege check before
    // anything else, so only a missing insert, update or delete privilege can refuse them.
    for (const { column } of columns) {
      const read = global.unsafe(`select ${column} from ${table} limit 1`)
      if (readsOf(table).includes(column)) await read
      else await expect(read, column).rejects.toThrow(/permission denied/)
      await expect(
        global.unsafe(`update ${table} set ${column} = null where false`),
        `update ${column}`,
      ).rejects.toThrow(/permission denied/)
    }
    for (const statement of [
      `insert into ${table} default values`,
      `delete from ${table} where false`,
    ]) {
      await expect(global.unsafe(statement), statement).rejects.toThrow(/permission denied/)
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

  // The route deletes the edition as opos_app, which holds no delete on the rows that cascade.
  it('lets opos_app delete an edition together with its programme', async () => {
    const tenant = await createTenant()
    const edition = await createEdition(tenant.id)
    const item = await createProgramItem(tenant.id, edition)
    await migrator`
      insert into program_item_speakers (tenant_id, program_item_id, account_id)
      values (${tenant.id}, ${item}, ${tenant.headId})
    `
    await migrator`
      insert into program_item_likes (tenant_id, program_item_id, account_id)
      values (${tenant.id}, ${item}, ${tenant.headId})
    `

    await inTenant(tenant.id, (sql) => sql`delete from editions where id = ${edition}`)

    const [left] = await migrator<{ items: number; speakers: number; likes: number }[]>`
      select
        (select count(*)::int from program_items where id = ${item}) as items,
        (select count(*)::int from program_item_speakers where program_item_id = ${item}) as speakers,
        (select count(*)::int from program_item_likes where program_item_id = ${item}) as likes
    `
    expect(left).toEqual({ items: 0, speakers: 0, likes: 0 })
  })

  it('lets opos_app write programme items, their speakers and likes', async () => {
    const edition = await createEdition(b.id)
    const account = await createUser()

    await inTenant(b.id, async (sql) => {
      const [item] = await sql<{ id: string }[]>`
        insert into program_items (tenant_id, edition_id, title, starts_at, ends_at)
        values (${b.id}, ${edition}, 'Item', '2026-06-01 10:00Z', '2026-06-01 11:00Z')
        returning id
      `
      await sql`
        update program_items
        set title = 'Renamed', description = 'Text', starts_at = starts_at, ends_at = ends_at
        where id = ${item!.id}
      `
      await sql`
        insert into program_item_speakers (tenant_id, program_item_id, account_id)
        values (${b.id}, ${item!.id}, ${account.id})
      `
      await sql`delete from program_item_speakers where program_item_id = ${item!.id}`
      await sql`
        insert into program_item_likes (tenant_id, program_item_id, account_id)
        values (${b.id}, ${item!.id}, ${account.id})
      `
      await sql`delete from program_item_likes where program_item_id = ${item!.id}`
      await sql`delete from program_items where id = ${item!.id}`
    })
  })

  it('lets opos_app update only the columns the API changes', async () => {
    await inTenant(b.id, (sql) => sql`update tenants set name = name where id = ${b.id}`)
    for (const statement of [
      'update tenants set slug = slug',
      'update tenant_memberships set account_id = account_id',
      'update edition_memberships set tenant_membership_id = tenant_membership_id',
      'update editions set id = id',
      'update program_items set tenant_id = tenant_id',
      'update program_items set edition_id = edition_id',
      'update program_item_speakers set account_id = account_id',
      'update program_item_likes set account_id = account_id',
    ]) {
      await expect(inTenant(b.id, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /permission denied/,
      )
    }
  })
})
