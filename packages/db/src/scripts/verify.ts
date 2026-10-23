import postgres from 'postgres'
import { migrationUrl } from '../migration-url'

const sql = postgres(migrationUrl(), { max: 1, onnotice: () => {} })

try {
  const unprotected = await sql<{ relname: string }[]>`
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  `
  if (unprotected.length > 0) {
    console.error(
      `Tables with tenant_id and no RLS: ${unprotected.map((r) => r.relname).join(', ')}`,
    )
    process.exitCode = 1
  } else {
    console.log('Every table with tenant_id has RLS enabled.')
  }
} finally {
  await sql.end()
}
