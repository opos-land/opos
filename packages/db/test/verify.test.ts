import type postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { verifyDatabase } from '../src/verify'
import { migrator, supabaseAdmin, superuser } from './db'

class Rollback extends Error {}

/**
 * Runs `change` as opos_migrator, or as a more privileged role for what the migrator may not
 * grant, verifies the result, then rolls everything back.
 */
async function problemsAfter(
  change: (sql: postgres.TransactionSql) => Promise<unknown>,
  as: postgres.Sql = migrator,
) {
  let problems: string[] = []
  await as
    .begin(async (sql) => {
      await change(sql)
      problems = await verifyDatabase(sql)
      throw new Rollback()
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error
    })
  return problems
}

const tenantTable = (name: string) => `
  create table public.${name} (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id)
  );
`

const isolated = (name: string) => `
  alter table public.${name} enable row level security;
  alter table public.${name} force row level security;
  create policy tenant_isolation on public.${name}
    using (tenant_id = (select current_setting('app.tenant_id')::uuid))
    with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
`

describe('verifyDatabase', () => {
  it('reports no problem on the migrated schema', async () => {
    expect(await problemsAfter(async () => {})).toEqual([])
  })

  it('accepts a tenant table that follows PLAN.md 4.6', async () => {
    const problems = await problemsAfter((sql) =>
      sql.unsafe(`${tenantTable('verify_probe')}; ${isolated('verify_probe')}`),
    )
    expect(problems).toEqual([])
  })

  describe('row level security', () => {
    it('reports a tenant table without RLS', async () => {
      const problems = await problemsAfter((sql) => sql.unsafe(tenantTable('verify_probe')))
      expect(problems.join('\n')).toMatch(/without enabled and forced RLS: verify_probe/)
    })

    it('reports a tenant table with RLS enabled but not forced', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          ${tenantTable('verify_probe')}; ${isolated('verify_probe')}
          alter table public.verify_probe no force row level security;
        `),
      )
      expect(problems.join('\n')).toMatch(/without enabled and forced RLS: verify_probe/)
    })

    it('reports a tenant table without the tenant_isolation policy', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          ${tenantTable('verify_probe')}
          alter table public.verify_probe enable row level security;
          alter table public.verify_probe force row level security;
        `),
      )
      expect(problems.join('\n')).toMatch(/verify_probe has no tenant_isolation policy/)
    })

    it('reports a tenant_isolation policy with another condition', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          ${tenantTable('verify_probe')}
          alter table public.verify_probe enable row level security;
          alter table public.verify_probe force row level security;
          create policy tenant_isolation on public.verify_probe using (true) with check (true);
        `),
      )
      expect(problems.join('\n')).toMatch(/verify_probe\.tenant_isolation must be/)
    })

    it('reports a public table that is neither a tenant table nor global', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`create table public.verify_probe (id uuid primary key, edition_id uuid)`),
      )
      expect(problems.join('\n')).toMatch(/neither tenant tables nor global: verify_probe/)
    })

    it('reports a partitioned tenant table without RLS', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          create table public.verify_probe (id uuid not null, tenant_id uuid not null)
            partition by hash (tenant_id)
        `),
      )
      expect(problems.join('\n')).toMatch(/without enabled and forced RLS: verify_probe/)
    })

    it('reports a view that does not run as its caller', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`create view public.verify_probe as select id, tenant_id from public.editions`),
      )
      expect(problems.join('\n')).toMatch(/without security_invoker: verify_probe/)
    })

    it('accepts a view that runs as its caller', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          create view public.verify_probe with (security_invoker = true)
            as select id, tenant_id from public.editions
        `),
      )
      expect(problems).toEqual([])
    })

    it('reports a materialized view, which RLS cannot cover', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(
          `create materialized view public.verify_probe as select id, tenant_id from public.editions`,
        ),
      )
      expect(problems.join('\n')).toMatch(/Materialized views in public: verify_probe/)
    })
  })

  describe('security definer functions', () => {
    const definer = (options: string) => `
      create function public.verify_probe() returns integer
        language sql security definer ${options} as 'select 1';
    `

    it('accepts one with a pinned search_path that no runtime role executes', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          ${definer(`set search_path = ''`)}
          revoke execute on function public.verify_probe() from public;
        `),
      )
      expect(problems).toEqual([])
    })

    it('reports one without a pinned search_path', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          ${definer('')}
          revoke execute on function public.verify_probe() from public;
        `),
      )
      expect(problems.join('\n')).toMatch(/without a pinned search_path: verify_probe/)
    })

    it('reports one that every role may execute, as Postgres grants by default', async () => {
      const problems = await problemsAfter((sql) => sql.unsafe(definer(`set search_path = ''`)))
      expect(problems.join('\n')).toMatch(
        /executable by opos_app, opos_app_global, .*: verify_probe/,
      )
    })

    it('reports one granted to opos_app_global', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          ${definer(`set search_path = ''`)}
          revoke execute on function public.verify_probe() from public;
          grant execute on function public.verify_probe() to opos_app_global;
        `),
      )
      expect(problems.join('\n')).toMatch(/executable by opos_app_global: verify_probe/)
    })
  })

  describe('policies', () => {
    it('reports a permissive policy besides tenant_isolation', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`create policy everything on public.editions for select using (true)`),
      )
      expect(problems.join('\n')).toMatch(/besides tenant_isolation: editions\.everything/)
    })
  })

  describe('runtime privileges', () => {
    it('reports a write granted to opos_app_global', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant insert on public.editions to opos_app_global`),
      )
      expect(problems.join('\n')).toMatch(/opos_app_global INSERT on editions/)
    })

    it('reports a read of accounts granted to opos_app_global', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant select on public.accounts to opos_app_global`),
      )
      expect(problems.join('\n')).toMatch(/opos_app_global SELECT on accounts/)
    })

    it('reports a delete opos_app does not need', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant delete on public.tenants to opos_app`),
      )
      expect(problems.join('\n')).toMatch(/opos_app DELETE on tenants/)
    })

    it('reports a table-level update granted to opos_app', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant update on public.editions to opos_app`),
      )
      expect(problems.join('\n')).toMatch(/opos_app UPDATE on editions/)
    })

    it.each(['anon', 'authenticated', 'service_role'])(
      'reports any privilege of %s on a public table',
      async (role) => {
        const problems = await problemsAfter((sql) =>
          sql.unsafe(`grant select on public.tenants to ${role}`),
        )
        expect(problems.join('\n')).toMatch(new RegExp(`${role} SELECT on tenants`))
      },
    )

    it('reports a column of accounts readable by opos_app_global', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant select (email) on public.accounts to opos_app_global`),
      )
      expect(problems.join('\n')).toMatch(/opos_app_global SELECT \(email\) on accounts/)
    })

    it('reports a column-level write granted to opos_app_global', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant update (name) on public.tenants to opos_app_global`),
      )
      expect(problems.join('\n')).toMatch(/opos_app_global UPDATE \(name\) on tenants/)
    })

    it.each([
      ['tenant_memberships', 'account_id'],
      ['editions', 'tenant_id'],
      ['edition_memberships', 'tenant_membership_id'],
      ['tenants', 'slug'],
    ])('reports an update of %s.%s granted to opos_app', async (table, column) => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant update (${column}) on public.${table} to opos_app`),
      )
      expect(problems.join('\n')).toMatch(new RegExp(`opos_app UPDATE \\(${column}\\) on ${table}`))
    })

    it('reports a column-level insert opos_app does not need', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant insert (slug, name) on public.tenants to opos_app`),
      )
      expect(problems.join('\n')).toMatch(/opos_app INSERT \(slug\) on tenants/)
    })

    it('reports a column privilege of a Supabase API role', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant select (id) on public.tenants to anon`),
      )
      expect(problems.join('\n')).toMatch(/anon SELECT \(id\) on tenants/)
    })

    it('reports a relation in public owned by a runtime role', async () => {
      const problems = await problemsAfter(
        (sql) =>
          sql.unsafe(`
            create table public.verify_probe (id uuid primary key, tenant_id uuid not null);
            ${isolated('verify_probe')}
            alter table public.verify_probe owner to opos_app;
          `),
        supabaseAdmin,
      )
      expect(problems.join('\n')).toMatch(/owned by a runtime role: verify_probe \(opos_app\)/)
    })

    it('reports opos_app able to bypass RLS', async () => {
      const problems = await problemsAfter(
        (sql) => sql.unsafe(`alter role opos_app bypassrls`),
        superuser,
      )
      expect(problems.join('\n')).toMatch(/opos_app must not bypass RLS/)
    })

    it('reports usage on schema public for a Supabase API role', async () => {
      const problems = await problemsAfter(
        (sql) => sql.unsafe(`grant usage on schema public to anon`),
        superuser,
      )
      expect(problems.join('\n')).toMatch(/schema public the rules forbid: anon USAGE/)
    })
  })
})
