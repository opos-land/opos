-- The panel's /forgot-password. The words come from RESERVED_TENANT_SLUGS in packages/db/src/schema/tenants.ts.
ALTER TABLE "tenants" DROP CONSTRAINT "tenants_slug_not_reserved";--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_slug_not_reserved" CHECK ("tenants"."slug" not in ('admin', 'api', 'auth', 'forgot-password', 'invitation', 'login', 'panel', 'scanner', 'www'));