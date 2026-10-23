-- accounts has no RLS (PLAN.md 4.6), so its privileges are the database-side limit. Rows come from
-- the auth.users triggers and leave with the auth.users cascade, both running as opos_migrator;
-- the API reads accounts and changes only what PATCH /me changes.
revoke insert, update, delete on accounts from opos_app, opos_app_global;
--> statement-breakpoint
grant update (first_name, last_name, locale) on accounts to opos_app;
