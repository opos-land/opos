import type postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { verifyDatabase } from '../src/verify'
import { migrator, superuser } from './db'

class Rollback extends Error {}

/**
 * Runs `change` as opos_migrator, or as postgres for what only it may grant, verifies the result,
 * then rolls everything back.
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

    it('reports usage on schema public for a Supabase API role', async () => {
      const problems = await problemsAfter(
        (sql) => sql.unsafe(`grant usage on schema public to anon`),
        superuser,
      )
      expect(problems.join('\n')).toMatch(/schema public the rules forbid: anon USAGE/)
    })
  })
})
