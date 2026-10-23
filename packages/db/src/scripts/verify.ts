import postgres from 'postgres'
import { migrationUrl } from '../migration-url'

const sql = postgres(migrationUrl(), { max: 1, onnotice: () => {} })

try {
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
    console.error(
      `Tables without enabled and forced RLS and a tenant_isolation policy: ${unprotected.map((r) => r.relname).join(', ')}`,
    )
    process.exitCode = 1
  } else {
    console.log('Every covered table has enabled and forced RLS and a tenant_isolation policy.')
  }
} finally {
  await sql.end()
}
