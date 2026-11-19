CREATE TYPE "public"."edition_document_kind" AS ENUM('shop-terms', 'privacy-policy', 'edition-rules', 'other');--> statement-breakpoint
CREATE TABLE "edition_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"document_id" uuid,
	"text" text NOT NULL,
	"is_required" boolean NOT NULL,
	"position" integer NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edition_consents_text" CHECK (char_length(btrim("edition_consents"."text")) between 1 and 1000),
	CONSTRAINT "edition_consents_position" CHECK ("edition_consents"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "edition_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"file_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edition_document_versions_document_number_unique" UNIQUE("document_id","number"),
	CONSTRAINT "edition_document_versions_number" CHECK ("edition_document_versions"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "edition_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"kind" "edition_document_kind" NOT NULL,
	"title" text NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edition_documents_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id"),
	CONSTRAINT "edition_documents_title" CHECK (char_length(btrim("edition_documents"."title")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "edition_shops" (
	"edition_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"opened_at" timestamp with time zone,
	"faq_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_provider_accounts" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"credentials" text NOT NULL,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_provider_accounts_provider" CHECK ("payment_provider_accounts"."provider" in ('fake', 'przelewy24')),
	CONSTRAINT "payment_provider_accounts_credentials" CHECK ("payment_provider_accounts"."credentials" <> '')
);
--> statement-breakpoint
CREATE TABLE "shop_sellers" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"seller_name" text,
	"seller_address" text,
	"seller_registration_number" text,
	"contact_email" text,
	"currency" text DEFAULT 'PLN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_sellers_currency" CHECK ("shop_sellers"."currency" = 'PLN'),
	CONSTRAINT "shop_sellers_not_blank" CHECK (btrim("shop_sellers"."seller_name") <> '' and btrim("shop_sellers"."seller_address") <> '' and btrim("shop_sellers"."seller_registration_number") <> '' and btrim("shop_sellers"."contact_email") <> '')
);
--> statement-breakpoint
ALTER TABLE "edition_consents" ADD CONSTRAINT "edition_consents_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_consents" ADD CONSTRAINT "edition_consents_document_fk" FOREIGN KEY ("document_id","tenant_id","edition_id") REFERENCES "public"."edition_documents"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_document_versions" ADD CONSTRAINT "edition_document_versions_document_fk" FOREIGN KEY ("document_id","tenant_id","edition_id") REFERENCES "public"."edition_documents"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id");--> statement-breakpoint
ALTER TABLE "edition_document_versions" ADD CONSTRAINT "edition_document_versions_file_fk" FOREIGN KEY ("file_id","tenant_id","edition_id") REFERENCES "public"."uploaded_files"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_documents" ADD CONSTRAINT "edition_documents_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_shops" ADD CONSTRAINT "edition_shops_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_accounts" ADD CONSTRAINT "payment_provider_accounts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sellers" ADD CONSTRAINT "shop_sellers_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edition_consents_tenant_edition_position_idx" ON "edition_consents" USING btree ("tenant_id","edition_id","position");--> statement-breakpoint
CREATE INDEX "edition_document_versions_tenant_document_idx" ON "edition_document_versions" USING btree ("tenant_id","document_id");--> statement-breakpoint
CREATE INDEX "edition_documents_tenant_edition_idx" ON "edition_documents" USING btree ("tenant_id","edition_id");--> statement-breakpoint
CREATE INDEX "edition_shops_tenant_idx" ON "edition_shops" USING btree ("tenant_id");