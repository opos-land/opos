CREATE TABLE "program_item_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_item_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_item_likes_tenant_item_account_unique" UNIQUE("tenant_id","program_item_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "program_item_speakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_item_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_item_speakers_tenant_item_account_unique" UNIQUE("tenant_id","program_item_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "program_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_items_id_tenant_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "program_items_ends_after_start" CHECK ("program_items"."ends_at" > "program_items"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "program_item_likes" ADD CONSTRAINT "program_item_likes_program_item_fk" FOREIGN KEY ("program_item_id","tenant_id") REFERENCES "public"."program_items"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_item_likes" ADD CONSTRAINT "program_item_likes_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_item_speakers" ADD CONSTRAINT "program_item_speakers_program_item_fk" FOREIGN KEY ("program_item_id","tenant_id") REFERENCES "public"."program_items"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_item_speakers" ADD CONSTRAINT "program_item_speakers_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_items" ADD CONSTRAINT "program_items_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "program_item_likes_account_idx" ON "program_item_likes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "program_item_speakers_account_idx" ON "program_item_speakers" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "program_items_tenant_edition_starts_idx" ON "program_items" USING btree ("tenant_id","edition_id","starts_at");