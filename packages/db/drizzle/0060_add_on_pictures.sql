CREATE TABLE "add_on_pictures" (
	"add_on_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "add_on_pictures_file_unique" UNIQUE("file_id")
);
--> statement-breakpoint
ALTER TABLE "add_on_pictures" ADD CONSTRAINT "add_on_pictures_add_on_fk" FOREIGN KEY ("add_on_id","tenant_id","edition_id") REFERENCES "public"."add_ons"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "add_on_pictures" ADD CONSTRAINT "add_on_pictures_file_fk" FOREIGN KEY ("file_id","tenant_id","edition_id") REFERENCES "public"."uploaded_files"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "add_on_pictures_tenant_edition_idx" ON "add_on_pictures" USING btree ("tenant_id","edition_id");