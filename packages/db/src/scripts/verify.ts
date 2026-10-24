import postgres from 'postgres'
import { migrationUrl } from '../migration-url'

const sql = postgres(migrationUrl(), { max: 1, onnotice: () => {} })

try {
  const problems: string[] = []

  // Covered tables: tenants and every public table with a tenant_id column (PLAN.md 4.6).
  const unprotected = await sql<{ relname: string }[]>`
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relname = 'tenants' or exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
      ))
      and not (c.relrowsecurity and c.relforcerowsecurity and exists (
        select 1 from pg_policy p
        where p.polrelid = c.oid and p.polname = 'tenant_isolation' and p.polcmd = '*'
      ))
    order by c.relname
  `
  if (unprotected.length > 0) {
    problems.push(
      `Tables without enabled and forced RLS and a tenant_isolation policy: ${unprotected.map((r) => r.relname).join(', ')}`,
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

  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exitCode = 1
  } else {
    console.log(
      'Every covered table has enabled and forced RLS and a tenant_isolation policy, and the roles hold only the privileges the rules allow.',
    )
  }
} finally {
  await sql.end()
}
