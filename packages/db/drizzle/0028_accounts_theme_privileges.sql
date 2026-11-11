-- PATCH /me changes the account's theme; accounts has no RLS, so the column grant is the limit
-- (docs/ARCHITECTURE.md, Tenant isolation).
grant update (theme) on accounts to opos_app;
