-- The primary keys of what a discount code applies to take the names the schema's other
-- composite keys have. A rename, not a new key: the tables keep their index and take no lock a
-- rebuild would.
ALTER TABLE "discount_code_add_ons" RENAME CONSTRAINT "discount_code_add_ons_pk" TO "discount_code_add_ons_pkey";--> statement-breakpoint
ALTER TABLE "discount_code_merchandise_items" RENAME CONSTRAINT "discount_code_merchandise_items_pk" TO "discount_code_merchandise_items_pkey";--> statement-breakpoint
ALTER TABLE "discount_code_ticket_types" RENAME CONSTRAINT "discount_code_ticket_types_pk" TO "discount_code_ticket_types_pkey";
