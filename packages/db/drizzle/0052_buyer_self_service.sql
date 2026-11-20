ALTER TABLE "edition_shops" ADD COLUMN "pickup_information" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "extends_order_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_extends_fk" FOREIGN KEY ("extends_order_id","tenant_id","edition_id") REFERENCES "public"."orders"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_tenant_extends_idx" ON "orders" USING btree ("tenant_id","extends_order_id");--> statement-breakpoint
ALTER TABLE "edition_shops" ADD CONSTRAINT "edition_shops_pickup_information" CHECK (char_length("edition_shops"."pickup_information") <= 1000);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_extends_another" CHECK ("orders"."extends_order_id" <> "orders"."id");