import type postgres from 'postgres'
import { RUNTIME_TIMEOUTS } from './client'
import { scramVerifier } from './scram'

const API_ROLES = 'anon, authenticated, service_role'

const RUNTIME_ROLES = [
  {
    name: 'opos_app',
    attributes: 'login nobypassrls nocreaterole nocreatedb noreplication',
    password: 'app',
  },
  {
    name: 'opos_app_global',
    attributes: 'login bypassrls nocreaterole nocreatedb noreplication',
    password: 'appGlobal',
  },
  {
    name: 'opos_admin',
    attributes: 'login bypassrls nocreaterole nocreatedb noreplication',
    password: 'admin',
  },
] as const

/** The password of each runtime role. */
export interface RolePasswords {
  app: string
  appGlobal: string
  admin: string
}

/**
 * The runtime roles and their defaults, as `postgres` may set them on a local stack and on a hosted
 * project alike: creates a missing runtime role, sets its attributes, password and limits, and
 * clears what a Supabase project starts with. Idempotent, so a change here reaches a database by
 * running it again. It runs in the caller's transaction, so it applies whole or not at all.
 */
export async function applyRoles(
  sql: postgres.TransactionSql,
  passwords: RolePasswords,
): Promise<void> {
  for (const { name, attributes, password } of RUNTIME_ROLES) {
    const [existing] = await sql`select 1 from pg_roles where rolname = ${name}`
    if (!existing) await sql.unsafe(`create role ${name}`)
    // The server logs a DDL statement (`log_statement = ddl`) and `pg_stat_statements` keeps its text,
    // so the statement carries a verifier, which Postgres stores as it is, and never the password.
    // A role statement takes no parameters: format quotes the verifier on the server.
    const [statement] = await sql<{ text: string }[]>`
      select format(${`alter role %I ${attributes} password %L`}::text, ${name}::text,
        ${scramVerifier(passwords[password])}::text) as text
    `
    await sql.unsafe(statement!.text)
    for (const [setting, value] of Object.entries(RUNTIME_TIMEOUTS)) {
      await sql.unsafe(`alter role ${name} set ${setting} = '${value}'`)
    }
  }

  await sql.unsafe(`
    grant usage on schema public to ${RUNTIME_ROLES.map((role) => role.name).join(', ')};
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
