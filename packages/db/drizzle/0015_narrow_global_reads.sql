-- opos_app_global reads only the columns the cross-tenant queries of PLAN.md 4.6 select, never a
-- whole table: a column added to a table is not readable across tenants until a query needs it.
revoke select on tenants, tenant_memberships, editions, edition_memberships, accepted_invitations from opos_app_global;
--> statement-breakpoint
grant select (id, slug, name, default_locale, timezone) on tenants to opos_app_global;
--> statement-breakpoint
grant select (id, tenant_id, account_id, role, settings_access, branding_access, shop_config_access, expires_at) on tenant_memberships to opos_app_global;
--> statement-breakpoint
grant select (id, slug, starts_at) on editions to opos_app_global;
--> statement-breakpoint
grant select (tenant_membership_id, edition_id, program_access, website_content_access, tickets_access) on edition_memberships to opos_app_global;
