import postgres from 'postgres'
import { migrationUrl } from '../migration-url'

const sql = postgres(migrationUrl(), { max: 1, onnotice: () => {} })

/**
 * The tenant_isolation condition of PLAN.md 4.6 as Postgres deparses it, for both USING and
 * WITH CHECK; `tenants` compares its own `id`, every other covered table its `tenant_id`.
 */
const isolation = (column: string) =>
  `(${column} = ( SELECT (current_setting('app.tenant_id'::text))::uuid AS current_setting))`

try {
  const problems: string[] = []

  // Covered tables: tenants and every public table with a tenant_id column (PLAN.md 4.6).
  const covered = await sql<{ relname: string; secured: boolean }[]>`
    select c.relname, c.relrowsecurity and c.relforcerowsecurity as secured
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relname = 'tenants' or exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
      ))
    order by c.relname
  `
  const unsecured = covered.filter((table) => !table.secured)
  if (unsecured.length > 0) {
    problems.push(
      `Tables without enabled and forced RLS: ${unsecured.map((r) => r.relname).join(', ')}`,
    )
  }

  const policies = await sql<
    {
      table: string
      name: string
      command: string
      permissive: boolean
      forPublic: boolean
      using: string | null
      withCheck: string | null
    }[]
  >`
    select c.relname as table, p.polname as name, p.polcmd as command,
      p.polpermissive as permissive, p.polroles = '{0}' as "forPublic",
      pg_get_expr(p.polqual, p.polrelid) as using,
      pg_get_expr(p.polwithcheck, p.polrelid) as "withCheck"
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = any(${covered.map((table) => table.relname)})
      and c.relnamespace = 'public'::regnamespace
    order by 1, 2
  `
  for (const { relname } of covered) {
    const expected = isolation(relname === 'tenants' ? 'id' : 'tenant_id')
    const policy = policies.find((p) => p.table === relname && p.name === 'tenant_isolation')
    if (!policy) {
      problems.push(`${relname} has no tenant_isolation policy`)
    } else if (
      policy.command !== '*' ||
      !policy.permissive ||
      !policy.forPublic ||
      policy.using !== expected ||
      policy.withCheck !== expected
    ) {
      problems.push(
        `${relname}.tenant_isolation must be a permissive policy for all commands and roles with USING and WITH CHECK ${expected}; found ${policy.command} ${policy.permissive ? 'permissive' : 'restrictive'} USING ${policy.using} WITH CHECK ${policy.withCheck}`,
      )
    }
  }
  // Permissive policies are OR-ed together, so any other one widens what tenant_isolation lets through.
  const extra = policies.filter((p) => p.permissive && p.name !== 'tenant_isolation')
  if (extra.length > 0) {
    problems.push(
      `Permissive policies besides tenant_isolation: ${extra.map((p) => `${p.table}.${p.name}`).join(', ')}`,
    )
  }

  // Runtime privileges (PLAN.md 4.6). has_table_privilege counts table-level grants only, so the
  // column-level updates opos_app holds pass.
  const overGranted = await sql<{ role: string; table: string; privilege: string }[]>`
    select r.role, c.relname as table, p.privilege
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('opos_app'), ('opos_app_global'), ('anon'), ('authenticated'), ('service_role')) r(role)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and has_table_privilege(r.role, c.oid, p.privilege)
      and (
        (r.role = 'opos_app_global' and (p.privilege <> 'SELECT' or c.relname = 'accounts'))
        or (r.role = 'opos_app' and p.privilege in ('UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
        or (r.role = 'opos_app' and c.relname in ('tenants', 'accounts') and p.privilege in ('INSERT', 'DELETE'))
        or r.role in ('anon', 'authenticated', 'service_role')
      )
    order by 1, 2, 3
  `
  if (overGranted.length > 0) {
    problems.push(
      `Privileges the runtime rules forbid: ${overGranted.map((r) => `${r.role} ${r.privilege} on ${r.table}`).join(', ')}`,
    )
  }

  // Supabase's API roles reach nothing in public, not even the schema (PLAN.md 4.6).
  const schemaGrants = await sql<{ role: string; privilege: string }[]>`
    select r.role, p.privilege
    from (values ('anon'), ('authenticated'), ('service_role')) r(role)
    cross join (values ('USAGE'), ('CREATE')) p(privilege)
    where has_schema_privilege(r.role, 'public', p.privilege)
    order by 1, 2
  `
  if (schemaGrants.length > 0) {
    problems.push(
      `Privileges on schema public the rules forbid: ${schemaGrants.map((r) => `${r.role} ${r.privilege}`).join(', ')}`,
    )
  }

  // opos_migrator holds on auth.users only what the foreign key and the sync triggers need.
  const authGrants = await sql<{ privilege: string; column: string | null }[]>`
    select p.privilege, null as column
    from (values ('SELECT'), ('INSERT'), ('UPDATE')) p(privilege)
    where has_any_column_privilege('opos_migrator', 'auth.users', p.privilege)
    union all
    select p.privilege, null
    from (values ('DELETE'), ('TRUNCATE')) p(privilege)
    where has_table_privilege('opos_migrator', 'auth.users', p.privilege)
    union all
    select 'REFERENCES', a.attname::text
    from pg_attribute a
    where a.attrelid = 'auth.users'::regclass and a.attnum > 0 and not a.attisdropped
      and a.attname <> 'id'
      and has_column_privilege('opos_migrator', 'auth.users', a.attname, 'REFERENCES')
    order by 1, 2
  `
  if (authGrants.length > 0) {
    problems.push(
      `Privileges of opos_migrator on auth.users beyond references (id) and trigger: ${authGrants.map((r) => (r.column ? `${r.privilege} (${r.column})` : r.privilege)).join(', ')}`,
    )
  }

  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exitCode = 1
  } else {
    console.log(
      'Every covered table has enabled and forced RLS and only the tenant_isolation policy of PLAN.md 4.6, and the roles hold only the privileges the rules allow.',
    )
  }
} finally {
  await sql.end()
}
