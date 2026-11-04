import type postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { RUNTIME_TIMEOUTS } from '../src/client'
import { verifyDatabase } from '../src/verify'
import { migrator, supabaseAdmin } from './db'

class Rollback extends Error {}

/**
 * Runs `change` as postgres, or as a more privileged role for what postgres may not grant,
 * verifies the result, then rolls everything back.
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

/** Expects the verification, after `change`, to report a problem matching `pattern`. */
async function expectProblem(
  change: (sql: postgres.TransactionSql) => Promise<unknown>,
  pattern: RegExp,
  as: postgres.Sql = migrator,
) {
  expect((await problemsAfter(change, as)).join('\n')).toMatch(pattern)
}

/** What a Supabase project starts with: an event trigger running a function that lives in public. */
const installEnsureRls = (sql: postgres.TransactionSql) =>
  sql.unsafe(`
    create function public.rls_auto_enable() returns event_trigger
      language plpgsql as 'begin end';
    create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable();
  `)

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

    it.each(['on', '1', 'yes', 't', 'TRU', 'y'])(
      'accepts a view with security_invoker = %s, as Postgres stores the value as written',
      async (value) => {
        const problems = await problemsAfter((sql) =>
          sql.unsafe(`
            create view public.verify_probe with (security_invoker = ${value})
              as select id, tenant_id from public.editions
          `),
        )
        expect(problems).toEqual([])
      },
    )

    it.each(['off', 'f', 'no', '0'])('reports a view with security_invoker = %s', async (value) => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          create view public.verify_probe with (security_invoker = ${value})
            as select id, tenant_id from public.editions
        `),
      )
      expect(problems.join('\n')).toMatch(/without security_invoker: verify_probe/)
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

    it('reports one that every role may execute through PUBLIC', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          ${definer(`set search_path = ''`)}
          grant execute on function public.verify_probe() to public;
        `),
      )
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

    it('reports a read of account_recovery_codes granted to opos_app_global', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant select on public.account_recovery_codes to opos_app_global`),
      )
      expect(problems.join('\n')).toMatch(/opos_app_global SELECT on account_recovery_codes/)
    })

    it.each(['code_hash', 'account_id', 'created_at'])(
      'reports opos_app holding update on account_recovery_codes.%s, which is not used_at',
      async (column) => {
        const problems = await problemsAfter((sql) =>
          sql.unsafe(`grant update (${column}) on public.account_recovery_codes to opos_app`),
        )
        expect(problems.join('\n')).toMatch(
          new RegExp(`opos_app UPDATE \\(${column}\\) on account_recovery_codes`),
        )
      },
    )

    it('reports a table-level update on account_recovery_codes granted to opos_app', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant update on public.account_recovery_codes to opos_app`),
      )
      expect(problems.join('\n')).toMatch(/opos_app UPDATE on account_recovery_codes/)
    })

    it('reports opos_app holding update on accounts.mfa_enabled_at', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant update (mfa_enabled_at) on public.accounts to opos_app`),
      )
      expect(problems.join('\n')).toMatch(/opos_app UPDATE \(mfa_enabled_at\) on accounts/)
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

    it('reports a table-level read granted to opos_app_global', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant select on public.editions to opos_app_global`),
      )
      expect(problems.join('\n')).toMatch(/opos_app_global SELECT on editions/)
    })

    it.each([
      ['editions', 'ends_at'],
      ['tenants', 'created_at'],
      ['accepted_invitations', 'jti'],
    ])(
      'reports a read of %s.%s, which no cross-tenant query needs, by opos_app_global',
      async (table, column) => {
        const problems = await problemsAfter((sql) =>
          sql.unsafe(`grant select (${column}) on public.${table} to opos_app_global`),
        )
        expect(problems.join('\n')).toMatch(
          new RegExp(`opos_app_global SELECT \\(${column}\\) on ${table}`),
        )
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

    it.each(['anon', 'opos_app_global'])(
      'reports a table-level grant on a view to %s',
      async (role) => {
        const problems = await problemsAfter((sql) =>
          sql.unsafe(`
            create view public.verify_probe with (security_invoker = true)
              as select id, tenant_id from public.editions;
            grant select, insert on public.verify_probe to ${role};
          `),
        )
        expect(problems.join('\n')).toMatch(new RegExp(`${role} INSERT on verify_probe`))
      },
    )

    it('reports a privilege on a sequence in public', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          create sequence public.verify_probe;
          grant usage on sequence public.verify_probe to opos_app;
        `),
      )
      expect(problems.join('\n')).toMatch(/opos_app USAGE on verify_probe/)
    })

    it.each(['opos_app', 'opos_app_global'])(
      'reports %s as a member of another role',
      async (role) => {
        const problems = await problemsAfter(
          (sql) => sql.unsafe(`grant anon to ${role}`),
          supabaseAdmin,
        )
        expect(problems.join('\n')).toMatch(new RegExp(`members of other roles: ${role} in anon`))
      },
    )

    it('reports opos_app able to bypass RLS', async () => {
      const problems = await problemsAfter((sql) => sql.unsafe(`alter role opos_app bypassrls`))
      expect(problems.join('\n')).toMatch(/opos_app must not bypass RLS/)
    })

    it('reports usage on schema public for a Supabase API role', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`grant usage on schema public to anon`),
      )
      expect(problems.join('\n')).toMatch(/schema public the rules forbid: anon USAGE/)
    })

    it.each([
      [
        'usage on the schema',
        'grant usage on schema auth to opos_app',
        /opos_app USAGE on schema auth/,
      ],
      [
        'create on the schema',
        'grant create on schema auth to opos_app_global',
        /opos_app_global CREATE on schema auth/,
      ],
      [
        'a table',
        'grant select on auth.users to opos_app_global',
        /opos_app_global SELECT on auth\.users/,
      ],
      [
        'a column',
        'grant update (email) on auth.users to opos_app',
        /opos_app UPDATE \(email\) on auth\.users/,
      ],
      [
        'a sequence',
        'grant usage on sequence auth.refresh_tokens_id_seq to opos_app',
        /opos_app USAGE on auth\.refresh_tokens_id_seq/,
      ],
      [
        'a function',
        'grant execute on function auth.uid() to opos_app',
        /opos_app EXECUTE on auth\.uid/,
      ],
    ])('reports a runtime role holding %s in auth', async (_, grant, report) => {
      const problems = await problemsAfter((sql) => sql.unsafe(grant), supabaseAdmin)
      expect(problems.join('\n')).toMatch(report)
    })
  })
  describe('traps of a hosted Supabase project', () => {
    it('reports a global table with RLS on and names it', async () => {
      await expectProblem(
        (sql) => sql.unsafe('alter table accounts enable row level security'),
        /Global tables with RLS on: accounts/,
      )
    })

    it('reports RLS on account_recovery_codes, a global table', async () => {
      await expectProblem(
        (sql) => sql.unsafe('alter table account_recovery_codes enable row level security'),
        /Global tables with RLS on: account_recovery_codes/,
      )
    })

    it('reports an event trigger whose function lives in public', async () => {
      await expectProblem(
        installEnsureRls,
        /Event triggers running a function in public: ensure_rls/,
        supabaseAdmin,
      )
    })

    it.each(['opos_app', 'opos_app_global'])('reports %s without a limit', async (role) => {
      await expectProblem(
        (sql) => sql.unsafe(`alter role ${role} reset statement_timeout`),
        new RegExp(`${role} lacks statement_timeout=15s`),
      )
    })

    it.each(Object.entries(RUNTIME_TIMEOUTS))(
      'reports opos_app with %s set to another value than %s',
      async (setting, value) => {
        await expectProblem(
          (sql) => sql.unsafe(`alter role opos_app set ${setting} = '1min'`),
          new RegExp(`opos_app lacks ${setting}=${value}`),
        )
      },
    )

    const inDatabase = async (sql: postgres.TransactionSql, role: string, value: string) => {
      const [row] = await sql<{ name: string }[]>`select current_database() as name`
      await sql.unsafe(
        `alter role ${role} in database ${row!.name} set statement_timeout = '${value}'`,
      )
    }

    it.each(['opos_app', 'opos_app_global'])(
      'reports %s with a per-database override of a limit, which beats the role setting',
      async (role) => {
        await expectProblem(
          (sql) => inDatabase(sql, role, '0'),
          new RegExp(`${role} has statement_timeout=0 in database \\w+, not 15s`),
          supabaseAdmin,
        )
      },
    )

    it('accepts a per-database setting equal to the limit', async () => {
      const problems = await problemsAfter(
        (sql) => inDatabase(sql, 'opos_app', '15s'),
        supabaseAdmin,
      )
      expect(problems).toEqual([])
    })

    it.each([
      ['opos_app', 'createrole', 'CREATEROLE'],
      ['opos_app', 'createdb', 'CREATEDB'],
      ['opos_app_global', 'replication', 'REPLICATION'],
      ['opos_app_global', 'createdb', 'CREATEDB'],
    ])('reports %s holding %s', async (role, attribute, label) => {
      await expectProblem(
        (sql) => sql.unsafe(`alter role ${role} ${attribute}`),
        new RegExp(`attributes they must not hold: .*${role} \\(.*${label}`),
      )
    })

    it.each(['opos_app', 'opos_app_global'])('reports %s holding SUPERUSER', async (role) => {
      await expectProblem(
        (sql) => sql.unsafe(`alter role ${role} superuser`),
        new RegExp(`attributes they must not hold: .*${role} \\(.*SUPERUSER`),
        supabaseAdmin,
      )
    })

    it.each(['opos_app', 'opos_app_global'])(
      'reports CREATE on schema public held by %s',
      async (role) => {
        await expectProblem(
          (sql) => sql.unsafe(`grant create on schema public to ${role}`),
          new RegExp(`schema public the rules forbid: ${role} CREATE`),
        )
      },
    )

    it.each([
      'opos_on_auth_user_created',
      'opos_on_auth_user_email_updated',
      'opos_on_auth_user_email_confirmed',
    ])('reports a missing %s on auth.users', async (trigger) => {
      await expectProblem(
        (sql) => sql.unsafe(`drop trigger ${trigger} on auth.users`),
        new RegExp(`auth\\.users lacks ${trigger}`),
        supabaseAdmin,
      )
    })

    it('reports a missing opos_on_auth_mfa_factor_changed on auth.mfa_factors', async () => {
      await expectProblem(
        (sql) => sql.unsafe('drop trigger opos_on_auth_mfa_factor_changed on auth.mfa_factors'),
        /auth\.mfa_factors lacks opos_on_auth_mfa_factor_changed/,
        supabaseAdmin,
      )
    })

    it('reports opos_on_auth_mfa_factor_changed disabled', async () => {
      await expectProblem(
        (sql) =>
          sql.unsafe(
            'alter table auth.mfa_factors disable trigger opos_on_auth_mfa_factor_changed',
          ),
        /auth\.mfa_factors lacks opos_on_auth_mfa_factor_changed/,
        supabaseAdmin,
      )
    })

    it('reports opos_on_auth_mfa_factor_changed recreated with other events', async () => {
      await expectProblem(
        (sql) =>
          sql.unsafe(`
            drop trigger opos_on_auth_mfa_factor_changed on auth.mfa_factors;
            create trigger opos_on_auth_mfa_factor_changed after insert on auth.mfa_factors
              for each row execute function public.opos_handle_mfa_factor_change();
          `),
        /auth\.mfa_factors\.opos_on_auth_mfa_factor_changed differs from its definition/,
        supabaseAdmin,
      )
    })

    it('reports a required trigger that is disabled', async () => {
      await expectProblem(
        (sql) => sql.unsafe('alter table auth.users disable trigger opos_on_auth_user_created'),
        /auth\.users lacks opos_on_auth_user_created/,
        supabaseAdmin,
      )
    })

    it('reports a required trigger recreated with other events', async () => {
      await expectProblem(
        (sql) =>
          sql.unsafe(`
            drop trigger opos_on_auth_user_email_updated on auth.users;
            create trigger opos_on_auth_user_email_updated before delete on auth.users
              for each row execute function public.handle_auth_user_email_updated();
          `),
        /auth\.users\.opos_on_auth_user_email_updated differs from its definition/,
        supabaseAdmin,
      )
    })

    it('reports a required trigger recreated to call another function', async () => {
      await expectProblem(
        (sql) =>
          sql.unsafe(`
            drop trigger opos_on_auth_user_email_updated on auth.users;
            create trigger opos_on_auth_user_email_updated
              after update of email on auth.users
              for each row when (old.email is distinct from new.email)
              execute function public.handle_auth_user_created();
          `),
        /auth\.users\.opos_on_auth_user_email_updated differs from its definition/,
        supabaseAdmin,
      )
    })

    it('accepts the required triggers through any role and search_path', async () => {
      for (const as of [migrator, supabaseAdmin]) {
        const problems = await problemsAfter(
          (sql) => sql.unsafe(`set local search_path = pg_catalog`),
          as,
        )
        expect(problems).toEqual([])
      }
    })

    it.each([
      ['users', 'opos_extra'],
      ['refresh_tokens', 'someone_elses'],
      ['mfa_factors', 'opos_extra'],
    ])('reports a trigger on auth.%s outside the required list', async (table, trigger) => {
      await expectProblem(
        (sql) =>
          sql.unsafe(`
            create function public.verify_probe_fn() returns trigger language plpgsql
              set search_path = '' as 'begin return new; end';
            create trigger ${trigger} after update on auth.${table}
              for each row execute function public.verify_probe_fn();
          `),
        new RegExp(
          `Triggers in the auth schema outside the required list: .*auth\\.${table}\\.${trigger}`,
        ),
        supabaseAdmin,
      )
    })

    it('reports any function in public a forbidden role may execute, definer or not', async () => {
      await expectProblem(
        (sql) =>
          sql.unsafe(`
            create function public.t_any() returns int language sql as 'select 1';
            grant execute on function public.t_any() to anon
          `),
        /executable by anon: t_any/,
      )
    })

    it('reports a function in public that every role may execute through PUBLIC', async () => {
      await expectProblem(
        (sql) =>
          sql.unsafe(`
            create function public.t_any() returns int language sql as 'select 1';
            grant execute on function public.t_any() to public
          `),
        /executable by anon, authenticated, service_role: t_any/,
      )
    })

    it('accepts a function in public that only the runtime roles may execute', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          create function public.t_any() returns int language sql as 'select 1';
          revoke execute on function public.t_any() from public;
          grant execute on function public.t_any() to opos_app, opos_app_global;
        `),
      )
      expect(problems).toEqual([])
    })

    it('reports a definer function once for each role that may execute it', async () => {
      const problems = await problemsAfter((sql) =>
        sql.unsafe(`
          create function public.t_any() returns int language sql security definer
            set search_path = '' as 'select 1';
          grant execute on function public.t_any() to anon;
          revoke execute on function public.t_any() from public;
          grant execute on function public.t_any() to anon;
        `),
      )
      expect(problems.filter((problem) => problem.includes('t_any'))).toEqual([
        'Security definer function executable by anon: t_any',
      ])
    })
  })
})
