-- OPOS database roles (PLAN.md 4.6).
-- Runs as supabase_admin from /docker-entrypoint-initdb.d/migrations on an empty data directory,
-- after Supabase's own roles and the auth schema exist.
\set migrator_password `echo "$OPOS_MIGRATOR_PASSWORD"`
\set app_password `echo "$OPOS_APP_PASSWORD"`
\set app_global_password `echo "$OPOS_APP_GLOBAL_PASSWORD"`

create role opos_migrator login bypassrls password :'migrator_password';
create role opos_app login nobypassrls password :'app_password';
create role opos_app_global login bypassrls password :'app_global_password';

-- Migrations create tables in public and drizzle's own schema for the migration journal.
grant create on database postgres to opos_migrator;
grant usage, create on schema public to opos_migrator;

-- accounts references auth.users, and the accounts sync triggers live on auth.users. Nothing reads
-- auth.users as opos_migrator: the trigger functions get the row as NEW, and Postgres checks the
-- foreign key as the table's owner.
grant usage on schema auth to opos_migrator;
grant references (id) on auth.users to opos_migrator;
grant trigger on auth.users to opos_migrator;

-- Table-level DML grants for the runtime roles come from the migrations.
grant usage on schema public to opos_app, opos_app_global;

-- anon, authenticated and service_role get nothing in public, neither directly nor through PUBLIC.
revoke all on schema public from public, anon, authenticated, service_role;
