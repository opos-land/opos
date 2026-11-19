CREATE TABLE "tenant_logos" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "venue_name" text;--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "venue_address" text;--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "venue_city" text;--> statement-breakpoint
ALTER TABLE "tenant_logos" ADD CONSTRAINT "tenant_logos_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_logos" ADD CONSTRAINT "tenant_logos_file_fk" FOREIGN KEY ("file_id","tenant_id") REFERENCES "public"."uploaded_files"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_venue_not_blank" CHECK (btrim("editions"."venue_name") <> '' and btrim("editions"."venue_address") <> '' and btrim("editions"."venue_city") <> '');