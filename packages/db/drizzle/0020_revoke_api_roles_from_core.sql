-- The Supabase API roles hold nothing in public (PLAN.md 4.6). db:roles removes the default grants
-- before the first migration, and migration 0001 revokes anon and authenticated from the core
-- tables; this revokes all three from them for a database where db:roles ran late.
revoke all on accounts, tenants, tenant_memberships, editions, edition_memberships from anon, authenticated, service_role;
