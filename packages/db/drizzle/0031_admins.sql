CREATE TYPE "public"."admin_action" AS ENUM('tenant.create', 'tenant.rename', 'tenant.suspend', 'tenant.restore', 'tenant.delete', 'account.reset-2fa', 'admin.grant', 'admin.revoke');--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" "admin_action" NOT NULL,
	"admin_account_id" uuid,
	"subject_tenant_id" uuid,
	"tenant_slug" text,
	"subject_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_actions_subject_matches_action" CHECK (case
        when "admin_actions"."action" in ('tenant.create', 'tenant.rename', 'tenant.suspend', 'tenant.restore', 'tenant.delete')
          then "admin_actions"."subject_tenant_id" is not null and "admin_actions"."tenant_slug" is not null
            and ("admin_actions"."subject_account_id" is null or "admin_actions"."action" = 'tenant.create')
        else "admin_actions"."subject_account_id" is not null and "admin_actions"."subject_tenant_id" is null and "admin_actions"."tenant_slug" is null
      end),
	CONSTRAINT "admin_actions_script_or_admin" CHECK (("admin_actions"."admin_account_id" is null) = ("admin_actions"."action" in ('admin.grant', 'admin.revoke')))
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mfa_enabled_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admins" ADD CONSTRAINT "admins_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_actions_created_at_idx" ON "admin_actions" USING btree ("created_at");