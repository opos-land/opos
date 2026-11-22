-- PATCH /me changes the nickname and the order of the name; accounts has no RLS, so the column
-- grant is the limit (docs/ARCHITECTURE.md, Tenant isolation).
grant update (nickname, name_order) on accounts to opos_app;
