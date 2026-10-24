-- Runtime privileges follow what the API does (PLAN.md 4.6). opos_app_global only reads.
revoke insert, update, delete on tenants, tenant_memberships, editions, edition_memberships from opos_app_global;
--> statement-breakpoint

-- Tenants are created and deleted by opos_migrator alone; the API changes the settings, not the slug.
revoke insert, update, delete on tenants from opos_app;
--> statement-breakpoint
grant update (name, default_locale, timezone) on tenants to opos_app;
--> statement-breakpoint

-- No update moves a row to another tenant, account or membership.
revoke update on tenant_memberships, editions, edition_memberships from opos_app;
--> statement-breakpoint
grant update (role, settings_access, branding_access, shop_config_access, expires_at) on tenant_memberships to opos_app;
--> statement-breakpoint
grant update (slug, name, starts_at, ends_at, is_active, is_published) on editions to opos_app;
--> statement-breakpoint
grant update (program_access, website_content_access, tickets_access) on edition_memberships to opos_app;
