CREATE TYPE "public"."age_band" AS ENUM('child', 'teen', 'adult');--> statement-breakpoint
CREATE TYPE "public"."order_email_kind" AS ENUM('order-confirmation', 'order-expired', 'payment-under-review', 'needs-review', 'payment-not-needed', 'payment-not-needed-orgs');--> statement-breakpoint
CREATE TYPE "public"."order_line_kind" AS ENUM('ticket', 'add_on', 'merchandise', 'discount');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('awaiting-payment', 'paid', 'paid-manual', 'expired', 'needs-review', 'declined', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."payment_attempt_status" AS ENUM('started', 'paid', 'failed', 'ended', 'refused');--> statement-breakpoint
CREATE TYPE "public"."payment_failure_reason" AS ENUM('declined', 'insufficient-funds', 'wrong-code', 'timed-out', 'canceled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_money_with" AS ENUM('convention', 'buyer');--> statement-breakpoint
CREATE TABLE "order_accounts" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_consents" (
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"document_version_id" uuid,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_consents_pkey" PRIMARY KEY("order_id","consent_id")
);
--> statement-breakpoint
CREATE TABLE "order_custom_field_answers" (
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"custom_field_id" uuid NOT NULL,
	"answer" text NOT NULL,
	CONSTRAINT "order_custom_field_answers_pkey" PRIMARY KEY("order_id","custom_field_id"),
	CONSTRAINT "order_custom_field_answers_answer" CHECK (char_length(btrim("order_custom_field_answers"."answer")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "order_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "order_email_kind" NOT NULL,
	"recipient" text NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_emails_recipient" CHECK ("order_emails"."recipient" <> ''),
	CONSTRAINT "order_emails_failed_attempts" CHECK ("order_emails"."failed_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "order_line_kind" NOT NULL,
	"ticket_type_id" uuid,
	"add_on_id" uuid,
	"merchandise_item_id" uuid,
	"merchandise_variant_id" uuid,
	"quantity" integer NOT NULL,
	"unit_amount_minor" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"handed_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_sells" CHECK (("order_lines"."ticket_type_id" is not null) = ("order_lines"."kind" = 'ticket') and ("order_lines"."add_on_id" is not null) = ("order_lines"."kind" = 'add_on') and ("order_lines"."merchandise_variant_id" is not null) = ("order_lines"."kind" = 'merchandise') and ("order_lines"."merchandise_item_id" is not null) = ("order_lines"."kind" = 'merchandise')),
	CONSTRAINT "order_lines_quantity" CHECK ("order_lines"."quantity" >= 1 and ("order_lines"."kind" = 'merchandise' or "order_lines"."quantity" = 1))
);
--> statement-breakpoint
CREATE TABLE "order_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "order_qr_code_orders" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"qr_code_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"code" text NOT NULL,
	"replaced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_qr_codes_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "order_qr_codes_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id"),
	CONSTRAINT "order_qr_codes_code" CHECK ("order_qr_codes"."code" <> '')
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" "order_status" NOT NULL,
	"email" text,
	"holder_name" text NOT NULL,
	"age_band" "age_band",
	"total_minor" integer NOT NULL,
	"currency" text DEFAULT 'PLN' NOT NULL,
	"holds" boolean NOT NULL,
	"hold_ends_at" timestamp with time zone,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"guardian_consent_acknowledged_at" timestamp with time zone,
	"provider_consent_accepted_at" timestamp with time zone,
	"result_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_tenant_number_unique" UNIQUE("tenant_id","number"),
	CONSTRAINT "orders_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id"),
	CONSTRAINT "orders_number" CHECK ("orders"."number" ~ '^[2-9A-HJKMNP-Z]{10}$'),
	CONSTRAINT "orders_total" CHECK ("orders"."total_minor" >= 0),
	CONSTRAINT "orders_currency" CHECK ("orders"."currency" = 'PLN'),
	CONSTRAINT "orders_holder_name" CHECK (char_length(btrim("orders"."holder_name")) between 1 and 200),
	CONSTRAINT "orders_email" CHECK ("orders"."email" = lower("orders"."email") and "orders"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+$' and char_length("orders"."email") <= 254)
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" "payment_attempt_status" NOT NULL,
	"amount_minor" integer NOT NULL,
	"paid_amount_minor" integer,
	"paid_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"money_with" "payment_money_with",
	"provider_reference" text,
	"failure_reason" "payment_failure_reason",
	"failure_code" text,
	"failure_message" text,
	"information" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_provider" CHECK ("payment_attempts"."provider" in ('fake', 'przelewy24')),
	CONSTRAINT "payment_attempts_amount" CHECK ("payment_attempts"."amount_minor" >= 1)
);
--> statement-breakpoint
ALTER TABLE "edition_consents" ADD CONSTRAINT "edition_consents_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id");
--> statement-breakpoint
ALTER TABLE "edition_document_versions" ADD CONSTRAINT "edition_document_versions_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id");
--> statement-breakpoint
ALTER TABLE "order_accounts" ADD CONSTRAINT "order_accounts_order_fk" FOREIGN KEY ("order_id","tenant_id","edition_id") REFERENCES "public"."orders"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_accounts" ADD CONSTRAINT "order_accounts_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_consents" ADD CONSTRAINT "order_consents_order_fk" FOREIGN KEY ("order_id","tenant_id","edition_id") REFERENCES "public"."orders"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_consents" ADD CONSTRAINT "order_consents_consent_fk" FOREIGN KEY ("consent_id","tenant_id","edition_id") REFERENCES "public"."edition_consents"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_consents" ADD CONSTRAINT "order_consents_version_fk" FOREIGN KEY ("document_version_id","tenant_id","edition_id") REFERENCES "public"."edition_document_versions"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_custom_field_answers" ADD CONSTRAINT "order_custom_field_answers_order_fk" FOREIGN KEY ("order_id","tenant_id","edition_id") REFERENCES "public"."orders"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_custom_field_answers" ADD CONSTRAINT "order_custom_field_answers_field_fk" FOREIGN KEY ("custom_field_id","tenant_id","edition_id") REFERENCES "public"."edition_custom_fields"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_emails" ADD CONSTRAINT "order_emails_order_fk" FOREIGN KEY ("order_id","tenant_id","edition_id") REFERENCES "public"."orders"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_fk" FOREIGN KEY ("order_id","tenant_id","edition_id") REFERENCES "public"."orders"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_ticket_type_fk" FOREIGN KEY ("ticket_type_id","tenant_id","edition_id") REFERENCES "public"."ticket_types"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_add_on_fk" FOREIGN KEY ("add_on_id","tenant_id","edition_id") REFERENCES "public"."add_ons"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_item_fk" FOREIGN KEY ("merchandise_item_id","tenant_id","edition_id") REFERENCES "public"."merchandise_items"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_fk" FOREIGN KEY ("merchandise_variant_id","tenant_id","edition_id","merchandise_item_id") REFERENCES "public"."merchandise_variants"("id","tenant_id","edition_id","merchandise_item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_links" ADD CONSTRAINT "order_links_order_fk" FOREIGN KEY ("order_id","tenant_id","edition_id") REFERENCES "public"."orders"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_qr_code_orders" ADD CONSTRAINT "order_qr_code_orders_order_fk" FOREIGN KEY ("order_id","tenant_id","edition_id") REFERENCES "public"."orders"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_qr_code_orders" ADD CONSTRAINT "order_qr_code_orders_code_fk" FOREIGN KEY ("qr_code_id","tenant_id","edition_id") REFERENCES "public"."order_qr_codes"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_qr_codes" ADD CONSTRAINT "order_qr_codes_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_fk" FOREIGN KEY ("order_id","tenant_id","edition_id") REFERENCES "public"."orders"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_accounts_tenant_account_idx" ON "order_accounts" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "order_consents_tenant_order_idx" ON "order_consents" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "order_custom_field_answers_tenant_order_idx" ON "order_custom_field_answers" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "order_emails_tenant_order_idx" ON "order_emails" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "order_emails_due_idx" ON "order_emails" USING btree ("next_attempt_at") WHERE "order_emails"."sent_at" is null;--> statement-breakpoint
CREATE INDEX "order_lines_tenant_order_idx" ON "order_lines" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "order_lines_tenant_ticket_type_idx" ON "order_lines" USING btree ("tenant_id","ticket_type_id");--> statement-breakpoint
CREATE INDEX "order_lines_tenant_add_on_idx" ON "order_lines" USING btree ("tenant_id","add_on_id");--> statement-breakpoint
CREATE INDEX "order_lines_tenant_variant_idx" ON "order_lines" USING btree ("tenant_id","merchandise_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_one_ticket" ON "order_lines" USING btree ("order_id") WHERE "order_lines"."kind" = 'ticket';--> statement-breakpoint
CREATE INDEX "order_links_tenant_order_idx" ON "order_links" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "order_qr_code_orders_tenant_code_idx" ON "order_qr_code_orders" USING btree ("tenant_id","qr_code_id");--> statement-breakpoint
CREATE INDEX "order_qr_codes_tenant_edition_idx" ON "order_qr_codes" USING btree ("tenant_id","edition_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_edition_status_idx" ON "orders" USING btree ("tenant_id","edition_id","status");--> statement-breakpoint
CREATE INDEX "orders_tenant_email_idx" ON "orders" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "payment_attempts_tenant_order_idx" ON "payment_attempts" USING btree ("tenant_id","order_id");