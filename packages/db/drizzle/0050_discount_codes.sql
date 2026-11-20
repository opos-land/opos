CREATE TYPE "public"."discount_code_kind" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TABLE "discount_code_add_ons" (
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"discount_code_id" uuid NOT NULL,
	"add_on_id" uuid NOT NULL,
	CONSTRAINT "discount_code_add_ons_pk" PRIMARY KEY("discount_code_id","add_on_id")
);
--> statement-breakpoint
CREATE TABLE "discount_code_merchandise_items" (
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"discount_code_id" uuid NOT NULL,
	"merchandise_item_id" uuid NOT NULL,
	CONSTRAINT "discount_code_merchandise_items_pk" PRIMARY KEY("discount_code_id","merchandise_item_id")
);
--> statement-breakpoint
CREATE TABLE "discount_code_ticket_types" (
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"discount_code_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	CONSTRAINT "discount_code_ticket_types_pk" PRIMARY KEY("discount_code_id","ticket_type_id")
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" "discount_code_kind" NOT NULL,
	"percent" integer,
	"amount_minor" integer,
	"usage_limit" integer,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_id_tenant_edition_unique" UNIQUE("id","tenant_id","edition_id"),
	CONSTRAINT "discount_codes_edition_code_unique" UNIQUE("edition_id","code"),
	CONSTRAINT "discount_codes_code" CHECK ("discount_codes"."code" ~ '^[a-z0-9-]{4,40}$'),
	CONSTRAINT "discount_codes_value" CHECK (("discount_codes"."kind" = 'percent' and "discount_codes"."percent" is not null and "discount_codes"."percent" between 1 and 100 and "discount_codes"."amount_minor" is null) or ("discount_codes"."kind" = 'amount' and "discount_codes"."amount_minor" is not null and "discount_codes"."amount_minor" between 1 and 100000000 and "discount_codes"."percent" is null)),
	CONSTRAINT "discount_codes_usage_limit" CHECK ("discount_codes"."usage_limit" >= 1),
	CONSTRAINT "discount_codes_window" CHECK ("discount_codes"."valid_until" > "discount_codes"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_code_id" uuid;--> statement-breakpoint
ALTER TABLE "discount_code_add_ons" ADD CONSTRAINT "discount_code_add_ons_code_fk" FOREIGN KEY ("discount_code_id","tenant_id","edition_id") REFERENCES "public"."discount_codes"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_code_add_ons" ADD CONSTRAINT "discount_code_add_ons_add_on_fk" FOREIGN KEY ("add_on_id","tenant_id","edition_id") REFERENCES "public"."add_ons"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_code_merchandise_items" ADD CONSTRAINT "discount_code_merchandise_items_code_fk" FOREIGN KEY ("discount_code_id","tenant_id","edition_id") REFERENCES "public"."discount_codes"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_code_merchandise_items" ADD CONSTRAINT "discount_code_merchandise_items_item_fk" FOREIGN KEY ("merchandise_item_id","tenant_id","edition_id") REFERENCES "public"."merchandise_items"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_code_ticket_types" ADD CONSTRAINT "discount_code_ticket_types_code_fk" FOREIGN KEY ("discount_code_id","tenant_id","edition_id") REFERENCES "public"."discount_codes"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_code_ticket_types" ADD CONSTRAINT "discount_code_ticket_types_ticket_type_fk" FOREIGN KEY ("ticket_type_id","tenant_id","edition_id") REFERENCES "public"."ticket_types"("id","tenant_id","edition_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_edition_fk" FOREIGN KEY ("edition_id","tenant_id") REFERENCES "public"."editions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discount_code_add_ons_tenant_idx" ON "discount_code_add_ons" USING btree ("tenant_id","discount_code_id");--> statement-breakpoint
CREATE INDEX "discount_code_merchandise_items_tenant_idx" ON "discount_code_merchandise_items" USING btree ("tenant_id","discount_code_id");--> statement-breakpoint
CREATE INDEX "discount_code_ticket_types_tenant_idx" ON "discount_code_ticket_types" USING btree ("tenant_id","discount_code_id");--> statement-breakpoint
CREATE INDEX "discount_codes_tenant_edition_idx" ON "discount_codes" USING btree ("tenant_id","edition_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code_fk" FOREIGN KEY ("discount_code_id","tenant_id","edition_id") REFERENCES "public"."discount_codes"("id","tenant_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_one_discount" ON "order_lines" USING btree ("order_id") WHERE "order_lines"."kind" = 'discount';--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_amount" CHECK (("order_lines"."kind" = 'discount' and "order_lines"."amount_minor" <= 0) or ("order_lines"."kind" <> 'discount' and "order_lines"."amount_minor" >= 0));