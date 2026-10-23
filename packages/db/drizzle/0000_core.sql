CREATE TYPE "public"."permission_level" AS ENUM('none', 'read', 'write');--> statement-breakpoint
CREATE TYPE "public"."tenant_role" AS ENUM('head', 'org');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "edition_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_membership_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"program_access" "permission_level" DEFAULT 'none' NOT NULL,
	"website_content_access" "permission_level" DEFAULT 'none' NOT NULL,
	"tickets_access" "permission_level" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edition_memberships_membership_edition_unique" UNIQUE("tenant_membership_id","edition_id")
);
--> statement-breakpoint
CREATE TABLE "editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editions_tenant_slug_unique" UNIQUE("tenant_id","slug"),
	CONSTRAINT "editions_id_tenant_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "editions_ends_after_start" CHECK ("editions"."ends_at" > "editions"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" "tenant_role" NOT NULL,
	"settings_access" "permission_level" DEFAULT 'none' NOT NULL,
	"branding_access" "permission_level" DEFAULT 'none' NOT NULL,
	"shop_config_access" "permission_level" DEFAULT 'none' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_memberships_account_tenant_unique" UNIQUE("account_id","tenant_id"),
	CONSTRAINT "tenant_memberships_id_tenant_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "tenant_memberships_head_never_expires" CHECK ("tenant_memberships"."role" = 'org' or "tenant_memberships"."expires_at" is null)
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"default_locale" text DEFAULT 'pl' NOT NULL,
	"timezone" text DEFAULT 'Europe/Warsaw' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_slug_format" CHECK ("tenants"."slug" ~ '^[a-z0-9-]{3,40}$')
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_auth_user_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_memberships" ADD CONSTRAINT "edition_memberships_membership_fk" FOREIGN KEY ("tenant_membership_id","tenant_id") REFERENCES "public"."tenant_memberships"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_memberships" ADD CONSTRAINT "edition_memberships_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edition_memberships_tenant_edition_idx" ON "edition_memberships" USING btree ("tenant_id","edition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "editions_one_active_per_tenant" ON "editions" USING btree ("tenant_id") WHERE "editions"."is_active";--> statement-breakpoint
CREATE INDEX "tenant_memberships_tenant_idx" ON "tenant_memberships" USING btree ("tenant_id");