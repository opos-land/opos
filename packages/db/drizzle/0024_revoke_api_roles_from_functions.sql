-- The Supabase API roles execute nothing in public (PLAN.md 4.6). db:roles removes their default
-- EXECUTE before the first migration; in a database where db:roles ran late the functions of
-- migrations 0001, 0009 and 0021 kept it, and db:verify reports them. Migration 0020 repairs the
-- tables; this repairs the functions.
revoke all on all functions in schema public from anon, authenticated, service_role;
