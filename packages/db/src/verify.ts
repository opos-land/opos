import type postgres from 'postgres'

/**
 * The tenant_isolation condition of PLAN.md 4.6 as Postgres deparses it, for both USING and
 * WITH CHECK; `tenants` compares its own `id`, every other covered table its `tenant_id`.
 */
const isolation = (column: string) =>
  `(${column} = ( SELECT (current_setting('app.tenant_id'::text))::uuid AS current_setting))`

/** The public tables outside tenant isolation (PLAN.md 4.2). */
const globalTables = ['accounts']

/**
 * The columns opos_app updates (PLAN.md 4.6): never `id`, `tenant_id` or a column that points a
 * row at an account or another row. A column the API starts changing joins this list in the PR
 * of the migration that grants it.
 */
const appUpdates = [
  'accounts.first_name',
  'accounts.last_name',
  'accounts.locale',
  'tenants.name',
  'tenants.default_locale',
  'tenants.timezone',
  'tenant_memberships.role',
  'tenant_memberships.settings_access',
  'tenant_memberships.branding_access',
  'tenant_memberships.shop_config_access',
  'tenant_memberships.expires_at',
  'editions.slug',
  'editions.name',
  'editions.starts_at',
  'editions.ends_at',
  'editions.is_active',
  'editions.is_published',
  'edition_memberships.program_access',
  'edition_memberships.website_content_access',
  'edition_memberships.tickets_access',
]

/**
 * Checks the database against the isolation rules of PLAN.md 4.6 and returns every violation;
 * an empty list means the rules hold. Reads the catalog only, so it runs in any transaction.
 */
export async function verifyDatabase(sql: postgres.TransactionSql): Promise<string[]> {
  const problems: string[] = []

  // Covered tables: tenants and every public table with a tenant_id column (PLAN.md 4.6).
  const covered = await sql<{ relname: string; secured: boolean }[]>`
    select c.relname, c.relrowsecurity and c.relforcerowsecurity as secured
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
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

  // A public table is either covered or one of the global tables of PLAN.md 4.2; a tenant table
  // keyed only through another row (an edition_id, an order_id) would escape every check above.
  const uncovered = await sql<{ relname: string }[]>`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not c.relname = any(${[...covered.map((table) => table.relname), ...globalTables]})
    order by 1
  `
  if (uncovered.length > 0) {
    problems.push(
      `Public tables that are neither tenant tables nor global: ${uncovered.map((r) => r.relname).join(', ')}`,
    )
  }

  // RLS never applies to a view on its own: one that runs as its owner, opos_migrator with
  // BYPASSRLS, reads every tenant. A materialized view cannot carry RLS at all.
  const views = await sql<{ relname: string; relkind: string }[]>`
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (c.relkind = 'm' or (c.relkind = 'v'
        and not exists (
          -- Postgres stores the value as written and reads it as a boolean: on, t, TRU, yes, 1.
          select 1 from unnest(c.reloptions) o
          where split_part(o, '=', 1) = 'security_invoker' and split_part(o, '=', 2)::boolean
        )))
    order by 1
  `
  const definerViews = views.filter((view) => view.relkind === 'v')
  if (definerViews.length > 0) {
    problems.push(
      `Views in public without security_invoker: ${definerViews.map((r) => r.relname).join(', ')}`,
    )
  }
  const materialized = views.filter((view) => view.relkind === 'm')
  if (materialized.length > 0) {
    problems.push(`Materialized views in public: ${materialized.map((r) => r.relname).join(', ')}`)
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
  // column-level updates opos_app holds pass. opos_app inserts and deletes only where the API
  // creates and removes rows: a write the API starts doing joins this list with its migration.
  const appWrites = [
    ['tenant_memberships', 'INSERT'],
    ['tenant_memberships', 'DELETE'],
    ['editions', 'INSERT'],
    ['editions', 'DELETE'],
    ['edition_memberships', 'INSERT'],
    ['edition_memberships', 'DELETE'],
    ['accepted_invitations', 'INSERT'],
  ].map((pair) => pair.join(' '))
  const overGranted = await sql<{ role: string; table: string; privilege: string }[]>`
    select r.role, c.relname as table, p.privilege
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('opos_app'), ('opos_app_global'), ('anon'), ('authenticated'), ('service_role')) r(role)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and has_table_privilege(r.role, c.oid, p.privilege)
      and (
        (r.role = 'opos_app_global' and (p.privilege <> 'SELECT' or c.relname = 'accounts'))
        or (r.role = 'opos_app' and p.privilege in ('UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
        or (r.role = 'opos_app' and p.privilege in ('INSERT', 'DELETE')
          and not (c.relname || ' ' || p.privilege) = any(${appWrites}))
        or r.role in ('anon', 'authenticated', 'service_role')
      )
    order by 1, 2, 3
  `
  if (overGranted.length > 0) {
    problems.push(
      `Privileges the runtime rules forbid: ${overGranted.map((r) => `${r.role} ${r.privilege} on ${r.table}`).join(', ')}`,
    )
  }

  // The same rules for column-level grants, which has_table_privilege does not see. opos_app
  // updates only the columns in appUpdates, never one that moves a row to another tenant or row.
  const overGrantedColumns = await sql<
    { role: string; table: string; column: string; privilege: string }[]
  >`
    select r.role, c.relname as table, a.attname as column, p.privilege
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join (values ('opos_app'), ('opos_app_global'), ('anon'), ('authenticated'), ('service_role')) r(role)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) p(privilege)
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and has_column_privilege(r.role, c.oid, a.attnum, p.privilege)
      and not has_table_privilege(r.role, c.oid, p.privilege)
      and (
        (r.role = 'opos_app_global' and (p.privilege <> 'SELECT' or c.relname = 'accounts'))
        or (r.role = 'opos_app' and p.privilege = 'REFERENCES')
        or (r.role = 'opos_app' and p.privilege = 'INSERT'
          and not (c.relname || ' INSERT') = any(${appWrites}))
        or (r.role = 'opos_app' and p.privilege = 'UPDATE'
          and not (c.relname || '.' || a.attname) = any(${appUpdates}))
        or r.role in ('anon', 'authenticated', 'service_role')
      )
    order by 1, 2, 4, 3
  `
  if (overGrantedColumns.length > 0) {
    problems.push(
      `Column privileges the runtime rules forbid: ${overGrantedColumns.map((r) => `${r.role} ${r.privilege} (${r.column}) on ${r.table}`).join(', ')}`,
    )
  }

  // No runtime or Supabase API role holds anything on a sequence in public: ids are uuids.
  const sequenceGrants = await sql<{ role: string; sequence: string; privilege: string }[]>`
    select r.role, c.relname as sequence, p.privilege
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('opos_app'), ('opos_app_global'), ('anon'), ('authenticated'), ('service_role')) r(role)
    cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) p(privilege)
    where n.nspname = 'public' and c.relkind = 'S'
      and has_sequence_privilege(r.role, c.oid, p.privilege)
    order by 1, 2, 3
  `
  if (sequenceGrants.length > 0) {
    problems.push(
      `Sequence privileges the runtime rules forbid: ${sequenceGrants.map((r) => `${r.role} ${r.privilege} on ${r.sequence}`).join(', ')}`,
    )
  }

  // A member of another role holds what that role holds, ownership and BYPASSRLS included, and may
  // SET ROLE to it: the runtime roles are members of none.
  const memberships = await sql<{ member: string; role: string }[]>`
    select pg_get_userbyid(a.member) as member, pg_get_userbyid(a.roleid) as role
    from pg_auth_members a
    where pg_get_userbyid(a.member) in ('opos_app', 'opos_app_global')
    order by 1, 2
  `
  if (memberships.length > 0) {
    problems.push(
      `Runtime roles that are members of other roles: ${memberships.map((r) => `${r.member} in ${r.role}`).join(', ')}`,
    )
  }

  // opos_app is the role RLS holds to: it bypasses nothing and owns nothing, since an owner may
  // switch RLS off. opos_app_global reads across tenants on purpose and owns nothing either.
  const appRole = await sql<{ bypasses: boolean }[]>`
    select rolsuper or rolbypassrls as bypasses from pg_roles where rolname = 'opos_app'
  `
  if (appRole[0]?.bypasses !== false) {
    problems.push('opos_app must not bypass RLS: it must exist without SUPERUSER and BYPASSRLS')
  }
  const owned = await sql<{ relname: string; owner: string }[]>`
    select c.relname, pg_get_userbyid(c.relowner) as owner
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pg_get_userbyid(c.relowner) in ('opos_app', 'opos_app_global')
    order by 1
  `
  if (owned.length > 0) {
    problems.push(
      `Relations in public owned by a runtime role: ${owned.map((r) => `${r.relname} (${r.owner})`).join(', ')}`,
    )
  }

  // A security definer function runs as its owner, which bypasses RLS: it pins its search_path,
  // and no runtime role may call it directly. Postgres grants EXECUTE to PUBLIC on every new
  // function, so each one is revoked in its migration (PLAN.md 4.6).
  const definers = await sql<{ name: string; pinned: boolean; callers: string[] }[]>`
    select p.proname as name,
      coalesce(exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'), false)
        as pinned,
      array(
        select r.role from (values ('opos_app'), ('opos_app_global'), ('anon'), ('authenticated'), ('service_role')) r(role)
        where has_function_privilege(r.role, p.oid, 'EXECUTE')
      ) as callers
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
    order by 1
  `
  const unpinned = definers.filter((fn) => !fn.pinned)
  if (unpinned.length > 0) {
    problems.push(
      `Security definer functions without a pinned search_path: ${unpinned.map((fn) => fn.name).join(', ')}`,
    )
  }
  for (const fn of definers) {
    if (fn.callers.length > 0) {
      problems.push(`Security definer function executable by ${fn.callers.join(', ')}: ${fn.name}`)
    }
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

  return problems
}
