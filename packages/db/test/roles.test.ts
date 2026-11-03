import { createHash, createHmac, pbkdf2Sync } from 'node:crypto'
import type postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { RUNTIME_TIMEOUTS } from '../src/client'
import { applyRoles } from '../src/roles'
import { migrator, supabaseAdmin } from './db'

// db:roles (PLAN.md 4.6). Every case runs in a transaction that rolls back, so no other session,
// the API tests running beside these included, sees a change to a role, a default or a schema.

class Rollback extends Error {}

const passwords = { app: 'a1'.repeat(32), appGlobal: 'b2'.repeat(32) }
const apiRoles = ['anon', 'authenticated', 'service_role']
const runtimeRoles = ['opos_app', 'opos_app_global']

async function rolledBack(
  run: (tx: postgres.TransactionSql) => Promise<unknown>,
  as: postgres.Sql = migrator,
) {
  await as
    .begin(async (tx) => {
      await run(tx)
      throw new Rollback()
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error
    })
}

/** What a Supabase project starts with, and db:roles takes back. */
const supabaseDefaults = (tx: postgres.TransactionSql) =>
  tx.unsafe(`
    grant usage on schema public to public, anon, authenticated, service_role;
    alter default privileges for role postgres in schema public
      grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public
      grant all on sequences to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public
      grant all on functions to anon, authenticated, service_role;
    alter default privileges for role postgres grant execute on functions to public;
  `)

const installEnsureRls = (tx: postgres.TransactionSql) =>
  tx.unsafe(`
    create function public.rls_auto_enable() returns event_trigger
      language plpgsql security definer set search_path = pg_catalog as $$
      declare
        cmd record;
      begin
        for cmd in
          select * from pg_event_trigger_ddl_commands()
          where object_type = 'table' and schema_name = 'public'
        loop
          execute format('alter table %s enable row level security', cmd.object_identity);
        end loop;
      end
    $$;
    create event trigger ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  `)

const rlsOn = async (tx: postgres.TransactionSql, table: string) => {
  const [row] = await tx<{ relrowsecurity: boolean }[]>`
    select relrowsecurity from pg_class where oid = ${`public.${table}`}::regclass
  `
  return row!.relrowsecurity
}

const roleSettings = async (tx: postgres.TransactionSql, role: string) => {
  const rows = await tx<{ setting: string }[]>`
    select unnest(s.setconfig) as setting
    from pg_db_role_setting s
    join pg_roles r on r.oid = s.setrole
    where r.rolname = ${role} and s.setdatabase = 0
  `
  return rows.map((row) => row.setting)
}

/** Everything db:roles decides, but the passwords. */
const catalog = async (tx: postgres.TransactionSql) => ({
  roles: await tx`
    select rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolinherit
    from pg_roles where rolname = any(${runtimeRoles}) order by 1
  `,
  settings: await tx`
    select r.rolname, s.setconfig from pg_db_role_setting s
    join pg_roles r on r.oid = s.setrole
    where r.rolname = any(${runtimeRoles}) order by 1
  `,
  schema: await tx`select nspacl::text as acl from pg_namespace where nspname = 'public'`,
  defaults: await tx`
    select defaclnamespace::regnamespace::text as schema, defaclobjtype, defaclacl::text as acl
    from pg_default_acl where defaclrole = 'postgres'::regrole order by 1, 2
  `,
  triggers: await tx`select evtname from pg_event_trigger order by 1`,
})

/** The hash Postgres stored, read as a superuser. */
const storedPassword = async (tx: postgres.TransactionSql, role: string) => {
  const [row] = await tx<{ rolpassword: string }[]>`
    select rolpassword from pg_authid where rolname = ${role}
  `
  return row!.rolpassword
}

/** Whether a SCRAM-SHA-256 hash, as Postgres stores it, was made from `password`. */
function scramMatches(stored: string, password: string) {
  const match = /^SCRAM-SHA-256\$(\d+):([^$]+)\$([^:]+):/.exec(stored)
  if (!match) throw new Error('not a SCRAM-SHA-256 hash')
  const [, iterations, salt, storedKey] = match
  const salted = pbkdf2Sync(
    password,
    Buffer.from(salt!, 'base64'),
    Number(iterations),
    32,
    'sha256',
  )
  const clientKey = createHmac('sha256', salted).update('Client Key').digest()
  return createHash('sha256').update(clientKey).digest('base64') === storedKey
}

describe('applyRoles', () => {
  it('creates opos_app without BYPASSRLS and opos_app_global with it', async () => {
    await rolledBack(async (tx) => {
      await tx.unsafe(`
        drop owned by opos_app;
        drop owned by opos_app_global;
        drop role opos_app;
        drop role opos_app_global;
        set local role postgres;
      `)

      await applyRoles(tx, passwords)

      expect(
        await tx`
          select rolname, rolcanlogin, rolsuper, rolbypassrls from pg_roles
          where rolname = any(${runtimeRoles}) order by 1
        `,
      ).toEqual([
        { rolname: 'opos_app', rolcanlogin: true, rolsuper: false, rolbypassrls: false },
        { rolname: 'opos_app_global', rolcanlogin: true, rolsuper: false, rolbypassrls: true },
      ])
    }, supabaseAdmin)
  })

  it('sets the attributes of a role that holds others', async () => {
    await rolledBack(async (tx) => {
      await tx.unsafe(`
        alter role opos_app bypassrls nologin createrole;
        alter role opos_app_global nobypassrls createdb replication;
        set local role postgres;
      `)

      await applyRoles(tx, passwords)

      expect(
        await tx`
          select rolname, rolcanlogin, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
          from pg_roles where rolname = any(${runtimeRoles}) order by 1
        `,
      ).toEqual([
        {
          rolname: 'opos_app',
          rolcanlogin: true,
          rolbypassrls: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolreplication: false,
        },
        {
          rolname: 'opos_app_global',
          rolcanlogin: true,
          rolbypassrls: true,
          rolcreaterole: false,
          rolcreatedb: false,
          rolreplication: false,
        },
      ])
    }, supabaseAdmin)
  })

  it('is idempotent: running twice changes nothing and updates the passwords', async () => {
    await rolledBack(async (tx) => {
      const other = { app: 'c3'.repeat(32), appGlobal: 'd4'.repeat(32) }
      await tx.unsafe('set local role postgres')
      await applyRoles(tx, passwords)
      const once = await catalog(tx)
      await tx.unsafe('reset role')
      expect(scramMatches(await storedPassword(tx, 'opos_app'), passwords.app)).toBe(true)
      expect(scramMatches(await storedPassword(tx, 'opos_app_global'), passwords.appGlobal)).toBe(
        true,
      )

      await tx.unsafe('set local role postgres')
      await applyRoles(tx, other)
      expect(await catalog(tx)).toEqual(once)
      await tx.unsafe('reset role')
      expect(scramMatches(await storedPassword(tx, 'opos_app'), other.app)).toBe(true)
      expect(scramMatches(await storedPassword(tx, 'opos_app_global'), other.appGlobal)).toBe(true)
    }, supabaseAdmin)
  })

  it('sends no statement, text or parameter, that holds a password', async () => {
    await rolledBack(async (tx) => {
      await tx.unsafe('set local role postgres')
      const sent: string[] = []
      const watched = new Proxy(tx, {
        apply(target, thisArg, args: unknown[]) {
          sent.push(JSON.stringify(args))
          return (target as unknown as (...a: unknown[]) => unknown).apply(thisArg, args)
        },
        get(target, property, receiver) {
          const member = Reflect.get(target, property, receiver) as unknown
          if (property !== 'unsafe') return member
          return (...args: unknown[]) => {
            sent.push(JSON.stringify(args))
            return (member as (...a: unknown[]) => unknown).apply(target, args)
          }
        },
      })

      await applyRoles(watched, passwords)

      expect(sent.length).toBeGreaterThan(0)
      for (const password of Object.values(passwords)) {
        expect(sent.filter((text) => text.includes(password))).toEqual([])
      }
      await tx.unsafe('reset role')
      expect(scramMatches(await storedPassword(tx, 'opos_app'), passwords.app)).toBe(true)
    }, supabaseAdmin)
  })

  it('keeps a password working when it runs again, the salt being fresh each time', async () => {
    await rolledBack(async (tx) => {
      await tx.unsafe('set local role postgres')
      await applyRoles(tx, passwords)
      await tx.unsafe('reset role')
      const first = await storedPassword(tx, 'opos_app')

      await tx.unsafe('set local role postgres')
      await applyRoles(tx, passwords)
      await tx.unsafe('reset role')
      const second = await storedPassword(tx, 'opos_app')

      expect(second).not.toBe(first)
      expect(scramMatches(first, passwords.app)).toBe(true)
      expect(scramMatches(second, passwords.app)).toBe(true)
    }, supabaseAdmin)
  })

  it('takes a password that needs quoting as it is', async () => {
    await rolledBack(async (tx) => {
      const quoted = { app: `it's "odd"\\`, appGlobal: passwords.appGlobal }
      await tx.unsafe('set local role postgres')
      await applyRoles(tx, quoted)
      await tx.unsafe('reset role')
      expect(scramMatches(await storedPassword(tx, 'opos_app'), quoted.app)).toBe(true)
    }, supabaseAdmin)
  })

  it('leaves anon, authenticated and service_role nothing on schema public', async () => {
    await rolledBack(async (tx) => {
      await supabaseDefaults(tx)

      await applyRoles(tx, passwords)

      for (const role of apiRoles) {
        const [row] = await tx<{ usage: boolean; create: boolean }[]>`
          select has_schema_privilege(${role}, 'public', 'usage') as usage,
            has_schema_privilege(${role}, 'public', 'create') as create
        `
        expect(row, role).toEqual({ usage: false, create: false })
      }
    })
  })

  it('gives the runtime roles usage on schema public and no more', async () => {
    await rolledBack(async (tx) => {
      await applyRoles(tx, passwords)

      for (const role of runtimeRoles) {
        const [row] = await tx<{ usage: boolean; create: boolean }[]>`
          select has_schema_privilege(${role}, 'public', 'usage') as usage,
            has_schema_privilege(${role}, 'public', 'create') as create
        `
        expect(row, role).toEqual({ usage: true, create: false })
      }
    })
  })

  it('gives a new table, sequence and function no grant for them', async () => {
    await rolledBack(async (tx) => {
      await supabaseDefaults(tx)
      await tx.unsafe(`create table public.t_before (id int)`)
      const [before] = await tx<{ ok: boolean }[]>`
        select has_table_privilege('anon', 'public.t_before', 'select') as ok
      `
      expect(before!.ok).toBe(true)

      await applyRoles(tx, passwords)
      await tx.unsafe(`
        create table public.t_new (id int);
        create sequence public.t_seq;
        create function public.t_f() returns int language sql as $$select 1$$;
      `)

      for (const role of apiRoles) {
        const [row] = await tx<{ table: boolean; sequence: boolean; fn: boolean }[]>`
          select
            has_table_privilege(${role}, 'public.t_new',
              'select, insert, update, delete, truncate, references, trigger') as table,
            has_sequence_privilege(${role}, 'public.t_seq', 'usage, select, update') as sequence,
            has_function_privilege(${role}, 'public.t_f()', 'execute') as fn
        `
        expect(row, role).toEqual({ table: false, sequence: false, fn: false })
      }
    })
  })

  it('stops new functions being executable through PUBLIC', async () => {
    await rolledBack(async (tx) => {
      await supabaseDefaults(tx)
      await tx.unsafe('create function public.t_before() returns int language sql as $$select 1$$')
      const [before] = await tx<{ ok: boolean }[]>`
        select has_function_privilege('opos_app', 'public.t_before()', 'execute') as ok
      `
      expect(before!.ok).toBe(true)

      await applyRoles(tx, passwords)
      await tx.unsafe('create function public.t_f() returns int language sql as $$select 1$$')

      for (const role of [...apiRoles, ...runtimeRoles]) {
        const [row] = await tx<{ ok: boolean }[]>`
          select has_function_privilege(${role}, 'public.t_f()', 'execute') as ok
        `
        expect(row!.ok, role).toBe(false)
      }
    })
  })

  it.each(runtimeRoles)('sets the three limits on %s', async (role) => {
    await rolledBack(async (tx) => {
      await applyRoles(tx, passwords)

      expect(await roleSettings(tx, role)).toEqual(
        expect.arrayContaining([
          'statement_timeout=15s',
          'idle_in_transaction_session_timeout=15s',
          'transaction_timeout=30s',
        ]),
      )
    })
  })

  it('writes the limits from RUNTIME_TIMEOUTS', async () => {
    await rolledBack(async (tx) => {
      await applyRoles(tx, passwords)

      for (const role of runtimeRoles) {
        const held = await roleSettings(tx, role)
        for (const [name, value] of Object.entries(RUNTIME_TIMEOUTS)) {
          expect(held, role).toContain(`${name}=${value}`)
        }
      }
    })
  })

  it('removes ensure_rls and rls_auto_enable when they exist', async () => {
    await rolledBack(async (tx) => {
      await installEnsureRls(tx)
      await tx.unsafe('create table public.t_before (id int)')
      expect(await rlsOn(tx, 't_before')).toBe(true)

      await applyRoles(tx, passwords)
      await tx.unsafe('create table public.t_new (id int)')

      expect(await rlsOn(tx, 't_new')).toBe(false)
      const [left] = await tx<{ trigger: boolean; fn: boolean }[]>`
        select
          exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') as trigger,
          to_regprocedure('public.rls_auto_enable()') is not null as fn
      `
      expect(left).toEqual({ trigger: false, fn: false })
    })
  })

  it('is fine when ensure_rls and rls_auto_enable do not exist', async () => {
    await rolledBack(async (tx) => {
      await expect(applyRoles(tx, passwords)).resolves.toBeUndefined()
    })
  })
})
