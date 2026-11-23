CREATE TABLE "account_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"name" text NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	CONSTRAINT "account_files_content_type" CHECK ("account_files"."content_type" in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "account_files_size" CHECK ("account_files"."size" between 1 and 15728640),
	CONSTRAINT "account_files_sha256" CHECK ("account_files"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_files_name" CHECK (char_length("account_files"."name") between 1 and 255),
	CONSTRAINT "account_files_dimensions" CHECK (("account_files"."width" is null and "account_files"."height" is null) or ("account_files"."width" is not null and "account_files"."height" is not null and "account_files"."width" > 0 and "account_files"."height" > 0))
);
--> statement-breakpoint
CREATE TABLE "uploaded_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"name" text NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid,
	CONSTRAINT "uploaded_files_id_tenant_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "uploaded_files_content_type" CHECK ("uploaded_files"."content_type" in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "uploaded_files_size" CHECK ("uploaded_files"."size" between 1 and 15728640),
	CONSTRAINT "uploaded_files_sha256" CHECK ("uploaded_files"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "uploaded_files_name" CHECK (char_length("uploaded_files"."name") between 1 and 255),
	CONSTRAINT "uploaded_files_dimensions" CHECK (("uploaded_files"."width" is null and "uploaded_files"."height" is null) or ("uploaded_files"."width" is not null and "uploaded_files"."height" is not null and "uploaded_files"."width" > 0 and "uploaded_files"."height" > 0))
);
--> statement-breakpoint
ALTER TABLE "account_files" ADD CONSTRAINT "account_files_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_files_account_idx" ON "account_files" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "uploaded_files_tenant_edition_idx" ON "uploaded_files" USING btree ("tenant_id","edition_id");