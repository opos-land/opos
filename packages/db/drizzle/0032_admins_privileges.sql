-- The admin role and the log of the admins' actions
-- (docs/adr/0030-guard-admin-access-with-its-own-role-application-and-second-factor.md).
-- Both tables are global, like accounts, so they have no RLS: privileges are their limit.
revoke all on admins, admin_actions from anon, authenticated, service_role, opos_app, opos_app_global, opos_admin;
--> statement-breakpoint

-- admins is written by postgres alone, behind db:admin:grant and db:admin:revoke. opos_admin reads
-- it to judge the account of a session, and to refuse the reset of an admin's second factor.
grant select (account_id, granted_at, mfa_enabled_at) on admins to opos_admin;
--> statement-breakpoint

-- The log: opos_admin reads it and adds to it, and changes or removes nothing. The insert is by
-- column, so an entry takes its identifier and its time from the database alone.
grant select (id, action, admin_account_id, subject_tenant_id, tenant_slug, subject_account_id, created_at) on admin_actions to opos_admin;
--> statement-breakpoint
grant insert (action, admin_account_id, subject_tenant_id, tenant_slug, subject_account_id) on admin_actions to opos_admin;
--> statement-breakpoint

-- The reset of an account's two-factor authentication: whether it is on, the language of the
-- notice, and the unused recovery codes, which go with the factors.
grant select (locale, mfa_enabled_at) on accounts to opos_admin;
--> statement-breakpoint
grant select (account_id, used_at) on account_recovery_codes to opos_admin;
--> statement-breakpoint
grant delete on account_recovery_codes to opos_admin;
