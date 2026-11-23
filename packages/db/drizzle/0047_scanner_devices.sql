CREATE TABLE "scanner_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled_by_membership_id" uuid,
	"pairing_code_hash" text NOT NULL,
	"pairing_expires_at" timestamp with time zone NOT NULL,
	"paired_at" timestamp with time zone,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scanner_devices_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id"),
	CONSTRAINT "scanner_devices_pairing_code_hash_unique" UNIQUE("pairing_code_hash"),
	CONSTRAINT "scanner_devices_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "scanner_devices_name" CHECK (char_length(btrim("scanner_devices"."name")) between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "handed_out_by" uuid;--> statement-breakpoint
ALTER TABLE "scanner_devices" ADD CONSTRAINT "scanner_devices_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Only the membership's column is emptied when the org behind a scanner is removed: the scanner
-- keeps its tenant, and the hand-outs it marked keep their scanner.
ALTER TABLE "scanner_devices" ADD CONSTRAINT "scanner_devices_enabled_by_fk" FOREIGN KEY ("enabled_by_membership_id","tenant_id") REFERENCES "public"."tenant_memberships"("id","tenant_id") ON DELETE set null ("enabled_by_membership_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scanner_devices_tenant_edition_idx" ON "scanner_devices" USING btree ("tenant_id","edition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scanner_devices_name_unique" ON "scanner_devices" USING btree ("edition_id","name") WHERE "scanner_devices"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_handed_out_by_fk" FOREIGN KEY ("handed_out_by","tenant_id","edition_id") REFERENCES "public"."scanner_devices"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_handed_out_by" CHECK ("order_lines"."handed_out_by" is null or "order_lines"."handed_out_at" is not null);