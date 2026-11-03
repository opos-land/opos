import type postgres from 'postgres'
import { RUNTIME_TIMEOUTS } from './client'

const API_ROLES = 'anon, authenticated, service_role'

const RUNTIME_ROLES = [
  { name: 'opos_app', attributes: 'login nobypassrls', password: 'app' },
  { name: 'opos_app_global', attributes: 'login bypassrls', password: 'appGlobal' },
] as const

/**
 * The roles and defaults of PLAN.md 4.6, as `postgres` may set them on a local stack and on a hosted
 * project alike: creates a missing runtime role, sets its attributes, password and limits, and
 * clears what a Supabase project starts with. Idempotent, so a change here reaches a database by
 * running it again. It runs in the caller's transaction, so it applies whole or not at all.
 */
export async function applyRoles(
  sql: postgres.TransactionSql,
  passwords: { app: string; appGlobal: string },
): Promise<void> {
  for (const { name, attributes, password } of RUNTIME_ROLES) {
    const [existing] = await sql`select 1 from pg_roles where rolname = ${name}`
    if (!existing) await sql.unsafe(`create role ${name}`)
    // A role statement takes no parameters: format quotes the password on the server.
    const [statement] = await sql<{ text: string }[]>`
      select format(${`alter role %I ${attributes} password %L`}::text, ${name}::text,
        ${passwords[password]}::text) as text
    `
    await sql.unsafe(statement!.text)
    for (const [setting, value] of Object.entries(RUNTIME_TIMEOUTS)) {
      await sql.unsafe(`alter role ${name} set ${setting} = '${value}'`)
    }
  }

  await sql.unsafe(`
    grant usage on schema public to opos_app, opos_app_global;
    revoke all on schema public from public, ${API_ROLES};
    alter default privileges for role postgres in schema public
      revoke all on tables from ${API_ROLES};
    alter default privileges for role postgres in schema public
      revoke all on sequences from ${API_ROLES};
    alter default privileges for role postgres in schema public
      revoke all on functions from ${API_ROLES};
    alter default privileges for role postgres revoke execute on functions from public;
    drop event trigger if exists ensure_rls;
    drop function if exists public.rls_auto_enable();
  `)
}
