CREATE TYPE "public"."add_on_kind" AS ENUM('unlimited', 'limited', 'headcount');--> statement-breakpoint
CREATE TABLE "add_ons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount_minor" integer NOT NULL,
	"kind" "add_on_kind" NOT NULL,
	"capacity" integer,
	"places_left_threshold" integer,
	"position" integer NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "add_ons_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id"),
	CONSTRAINT "add_ons_name" CHECK (char_length(btrim("add_ons"."name")) between 1 and 100),
	CONSTRAINT "add_ons_description" CHECK (char_length("add_ons"."description") <= 1000),
	CONSTRAINT "add_ons_amount" CHECK ("add_ons"."amount_minor" between 0 and 100000000),
	CONSTRAINT "add_ons_capacity" CHECK (("add_ons"."kind" = 'limited') = ("add_ons"."capacity" is not null) and ("add_ons"."capacity" is null or "add_ons"."capacity" >= 0)),
	CONSTRAINT "add_ons_threshold" CHECK ("add_ons"."places_left_threshold" is null or ("add_ons"."kind" = 'limited' and "add_ons"."places_left_threshold" >= 1)),
	CONSTRAINT "add_ons_position" CHECK ("add_ons"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "edition_custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_required" boolean NOT NULL,
	"position" integer NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edition_custom_fields_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id"),
	CONSTRAINT "edition_custom_fields_label" CHECK (char_length(btrim("edition_custom_fields"."label")) between 1 and 100),
	CONSTRAINT "edition_custom_fields_position" CHECK ("edition_custom_fields"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "merchandise_item_pictures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"merchandise_item_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "merchandise_item_pictures_file_unique" UNIQUE("file_id"),
	CONSTRAINT "merchandise_item_pictures_position" CHECK ("merchandise_item_pictures"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "merchandise_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount_minor" integer NOT NULL,
	"per_order_limit" integer NOT NULL,
	"pictures_illustrative" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchandise_items_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id"),
	CONSTRAINT "merchandise_items_name" CHECK (char_length(btrim("merchandise_items"."name")) between 1 and 100),
	CONSTRAINT "merchandise_items_description" CHECK (char_length("merchandise_items"."description") <= 5000),
	CONSTRAINT "merchandise_items_amount" CHECK ("merchandise_items"."amount_minor" between 0 and 100000000),
	CONSTRAINT "merchandise_items_per_order_limit" CHECK ("merchandise_items"."per_order_limit" between 1 and 100),
	CONSTRAINT "merchandise_items_position" CHECK ("merchandise_items"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "merchandise_option_axes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"merchandise_item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "merchandise_option_axes_id_item_unique" UNIQUE("id","tenant_id","edition_id","merchandise_item_id"),
	CONSTRAINT "merchandise_option_axes_name" CHECK (char_length(btrim("merchandise_option_axes"."name")) between 1 and 50),
	CONSTRAINT "merchandise_option_axes_position" CHECK ("merchandise_option_axes"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "merchandise_option_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"merchandise_item_id" uuid NOT NULL,
	"axis_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "merchandise_option_values_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id"),
	CONSTRAINT "merchandise_option_values_id_item_axis_unique" UNIQUE("id","tenant_id","edition_id","merchandise_item_id","axis_id"),
	CONSTRAINT "merchandise_option_values_label" CHECK (char_length(btrim("merchandise_option_values"."label")) between 1 and 50),
	CONSTRAINT "merchandise_option_values_position" CHECK ("merchandise_option_values"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "merchandise_size_charts" (
	"option_value_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "merchandise_size_charts_file_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "merchandise_variant_values" (
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"merchandise_item_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"axis_id" uuid NOT NULL,
	"option_value_id" uuid NOT NULL,
	CONSTRAINT "merchandise_variant_values_pkey" PRIMARY KEY("variant_id","axis_id")
);
--> statement-breakpoint
CREATE TABLE "merchandise_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"merchandise_item_id" uuid NOT NULL,
	"stock" integer,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchandise_variants_id_item_unique" UNIQUE("id","tenant_id","edition_id","merchandise_item_id"),
	CONSTRAINT "merchandise_variants_stock" CHECK ("merchandise_variants"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ticket_type_add_ons" (
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"add_on_id" uuid NOT NULL,
	CONSTRAINT "ticket_type_add_ons_pkey" PRIMARY KEY("ticket_type_id","add_on_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_type_merchandise_items" (
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"merchandise_item_id" uuid NOT NULL,
	CONSTRAINT "ticket_type_merchandise_items_pkey" PRIMARY KEY("ticket_type_id","merchandise_item_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_type_perks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "ticket_type_perks_name" CHECK (char_length(btrim("ticket_type_perks"."name")) between 1 and 100),
	CONSTRAINT "ticket_type_perks_position" CHECK ("ticket_type_perks"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "ticket_type_price_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ticket_type_price_tiers_amount" CHECK ("ticket_type_price_tiers"."amount_minor" between 0 and 100000000),
	CONSTRAINT "ticket_type_price_tiers_window" CHECK ("ticket_type_price_tiers"."ends_at" > "ticket_type_price_tiers"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "ticket_type_supporter_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	CONSTRAINT "ticket_type_supporter_prices_amount_unique" UNIQUE("ticket_type_id","amount_minor"),
	CONSTRAINT "ticket_type_supporter_prices_amount" CHECK ("ticket_type_supporter_prices"."amount_minor" between 1 and 100000000)
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_description" text DEFAULT '' NOT NULL,
	"long_description" text DEFAULT '' NOT NULL,
	"capacity" integer,
	"sale_starts_at" timestamp with time zone NOT NULL,
	"sale_ends_at" timestamp with time zone NOT NULL,
	"allows_child" boolean NOT NULL,
	"allows_teen" boolean NOT NULL,
	"allows_adult" boolean NOT NULL,
	"discounts_excluded" boolean DEFAULT false NOT NULL,
	"shown_outside_sale_window" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_types_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id"),
	CONSTRAINT "ticket_types_name" CHECK (char_length(btrim("ticket_types"."name")) between 1 and 100),
	CONSTRAINT "ticket_types_short_description" CHECK (char_length("ticket_types"."short_description") <= 300),
	CONSTRAINT "ticket_types_long_description" CHECK (char_length("ticket_types"."long_description") <= 5000),
	CONSTRAINT "ticket_types_capacity" CHECK ("ticket_types"."capacity" >= 0),
	CONSTRAINT "ticket_types_sale_window" CHECK ("ticket_types"."sale_ends_at" > "ticket_types"."sale_starts_at"),
	CONSTRAINT "ticket_types_age_bands" CHECK ("ticket_types"."allows_child" or "ticket_types"."allows_teen" or "ticket_types"."allows_adult"),
	CONSTRAINT "ticket_types_position" CHECK ("ticket_types"."position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "edition_shops" ADD COLUMN "teen_from_age" integer;--> statement-breakpoint
ALTER TABLE "edition_shops" ADD COLUMN "adult_from_age" integer;--> statement-breakpoint
ALTER TABLE "edition_shops" ADD COLUMN "guardian_consent_form_url" text;--> statement-breakpoint
ALTER TABLE "edition_shops" ADD COLUMN "merch_preorder_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "edition_shops" ADD COLUMN "merch_only_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "edition_shops" ADD COLUMN "sales_closed_message" text;--> statement-breakpoint
ALTER TABLE "add_ons" ADD CONSTRAINT "add_ons_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_custom_fields" ADD CONSTRAINT "edition_custom_fields_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchandise_item_pictures" ADD CONSTRAINT "merchandise_item_pictures_item_fk" FOREIGN KEY ("merchandise_item_id","tenant_id","edition_id") REFERENCES "public"."merchandise_items"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchandise_item_pictures" ADD CONSTRAINT "merchandise_item_pictures_file_fk" FOREIGN KEY ("file_id","tenant_id","edition_id") REFERENCES "public"."uploaded_files"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchandise_items" ADD CONSTRAINT "merchandise_items_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchandise_option_axes" ADD CONSTRAINT "merchandise_option_axes_item_fk" FOREIGN KEY ("merchandise_item_id","tenant_id","edition_id") REFERENCES "public"."merchandise_items"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchandise_option_values" ADD CONSTRAINT "merchandise_option_values_axis_fk" FOREIGN KEY ("axis_id","tenant_id","edition_id","merchandise_item_id") REFERENCES "public"."merchandise_option_axes"("id","tenant_id","edition_id","merchandise_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchandise_size_charts" ADD CONSTRAINT "merchandise_size_charts_value_fk" FOREIGN KEY ("option_value_id","tenant_id","edition_id") REFERENCES "public"."merchandise_option_values"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchandise_size_charts" ADD CONSTRAINT "merchandise_size_charts_file_fk" FOREIGN KEY ("file_id","tenant_id","edition_id") REFERENCES "public"."uploaded_files"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchandise_variant_values" ADD CONSTRAINT "merchandise_variant_values_variant_fk" FOREIGN KEY ("variant_id","tenant_id","edition_id","merchandise_item_id") REFERENCES "public"."merchandise_variants"("id","tenant_id","edition_id","merchandise_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchandise_variant_values" ADD CONSTRAINT "merchandise_variant_values_value_fk" FOREIGN KEY ("option_value_id","tenant_id","edition_id","merchandise_item_id","axis_id") REFERENCES "public"."merchandise_option_values"("id","tenant_id","edition_id","merchandise_item_id","axis_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchandise_variants" ADD CONSTRAINT "merchandise_variants_item_fk" FOREIGN KEY ("merchandise_item_id","tenant_id","edition_id") REFERENCES "public"."merchandise_items"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_add_ons" ADD CONSTRAINT "ticket_type_add_ons_ticket_type_fk" FOREIGN KEY ("ticket_type_id","tenant_id","edition_id") REFERENCES "public"."ticket_types"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_add_ons" ADD CONSTRAINT "ticket_type_add_ons_add_on_fk" FOREIGN KEY ("add_on_id","tenant_id","edition_id") REFERENCES "public"."add_ons"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_merchandise_items" ADD CONSTRAINT "ticket_type_merchandise_items_ticket_type_fk" FOREIGN KEY ("ticket_type_id","tenant_id","edition_id") REFERENCES "public"."ticket_types"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_merchandise_items" ADD CONSTRAINT "ticket_type_merchandise_items_item_fk" FOREIGN KEY ("merchandise_item_id","tenant_id","edition_id") REFERENCES "public"."merchandise_items"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_perks" ADD CONSTRAINT "ticket_type_perks_ticket_type_fk" FOREIGN KEY ("ticket_type_id","tenant_id","edition_id") REFERENCES "public"."ticket_types"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_price_tiers" ADD CONSTRAINT "ticket_type_price_tiers_ticket_type_fk" FOREIGN KEY ("ticket_type_id","tenant_id","edition_id") REFERENCES "public"."ticket_types"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_supporter_prices" ADD CONSTRAINT "ticket_type_supporter_prices_ticket_type_fk" FOREIGN KEY ("ticket_type_id","tenant_id","edition_id") REFERENCES "public"."ticket_types"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "add_ons_tenant_edition_position_idx" ON "add_ons" USING btree ("tenant_id","edition_id","position");--> statement-breakpoint
CREATE INDEX "edition_custom_fields_tenant_edition_position_idx" ON "edition_custom_fields" USING btree ("tenant_id","edition_id","position");--> statement-breakpoint
CREATE INDEX "merchandise_item_pictures_tenant_item_idx" ON "merchandise_item_pictures" USING btree ("tenant_id","merchandise_item_id","position");--> statement-breakpoint
CREATE INDEX "merchandise_items_tenant_edition_position_idx" ON "merchandise_items" USING btree ("tenant_id","edition_id","position");--> statement-breakpoint
CREATE INDEX "merchandise_option_axes_tenant_item_idx" ON "merchandise_option_axes" USING btree ("tenant_id","merchandise_item_id");--> statement-breakpoint
CREATE INDEX "merchandise_option_values_tenant_axis_idx" ON "merchandise_option_values" USING btree ("tenant_id","axis_id");--> statement-breakpoint
CREATE INDEX "merchandise_size_charts_tenant_edition_idx" ON "merchandise_size_charts" USING btree ("tenant_id","edition_id");--> statement-breakpoint
CREATE INDEX "merchandise_variant_values_tenant_variant_idx" ON "merchandise_variant_values" USING btree ("tenant_id","variant_id");--> statement-breakpoint
CREATE INDEX "merchandise_variant_values_tenant_value_idx" ON "merchandise_variant_values" USING btree ("tenant_id","option_value_id");--> statement-breakpoint
CREATE INDEX "merchandise_variants_tenant_item_idx" ON "merchandise_variants" USING btree ("tenant_id","merchandise_item_id");--> statement-breakpoint
CREATE INDEX "ticket_type_add_ons_tenant_ticket_type_idx" ON "ticket_type_add_ons" USING btree ("tenant_id","ticket_type_id");--> statement-breakpoint
CREATE INDEX "ticket_type_add_ons_tenant_add_on_idx" ON "ticket_type_add_ons" USING btree ("tenant_id","add_on_id");--> statement-breakpoint
CREATE INDEX "ticket_type_merchandise_items_tenant_ticket_type_idx" ON "ticket_type_merchandise_items" USING btree ("tenant_id","ticket_type_id");--> statement-breakpoint
CREATE INDEX "ticket_type_merchandise_items_tenant_item_idx" ON "ticket_type_merchandise_items" USING btree ("tenant_id","merchandise_item_id");--> statement-breakpoint
CREATE INDEX "ticket_type_perks_tenant_ticket_type_idx" ON "ticket_type_perks" USING btree ("tenant_id","ticket_type_id","position");--> statement-breakpoint
CREATE INDEX "ticket_type_price_tiers_tenant_ticket_type_idx" ON "ticket_type_price_tiers" USING btree ("tenant_id","ticket_type_id");--> statement-breakpoint
CREATE INDEX "ticket_type_supporter_prices_tenant_ticket_type_idx" ON "ticket_type_supporter_prices" USING btree ("tenant_id","ticket_type_id");--> statement-breakpoint
CREATE INDEX "ticket_types_tenant_edition_position_idx" ON "ticket_types" USING btree ("tenant_id","edition_id","position");--> statement-breakpoint
ALTER TABLE "edition_shops" ADD CONSTRAINT "edition_shops_age_bands" CHECK (("edition_shops"."teen_from_age" is null) = ("edition_shops"."adult_from_age" is null) and ("edition_shops"."teen_from_age" is null or ("edition_shops"."teen_from_age" >= 1 and "edition_shops"."adult_from_age" > "edition_shops"."teen_from_age" and "edition_shops"."adult_from_age" <= 150)));--> statement-breakpoint
ALTER TABLE "edition_shops" ADD CONSTRAINT "edition_shops_sales_closed_message" CHECK (char_length("edition_shops"."sales_closed_message") <= 1000);