CREATE TYPE "public"."manual_order_reason" AS ENUM('desk', 'invoice', 'complimentary');--> statement-breakpoint
CREATE TYPE "public"."order_review_cause" AS ENUM('amount', 'unavailable');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "manual_reason" "manual_order_reason";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "review_cause" "order_review_cause";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "decline_reason" text;--> statement-breakpoint
-- A manual order written before it had a reason: the only ones were a seed's, recorded at a desk.
UPDATE "orders" SET "manual_reason" = 'desk', "email" = NULL WHERE "status" = 'paid-manual' AND "manual_reason" IS NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_manual_reason" CHECK ("orders"."status" <> 'paid-manual' or "orders"."manual_reason" is not null);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_manual_no_email" CHECK ("orders"."manual_reason" is null or "orders"."email" is null);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_note" CHECK (char_length("orders"."note") <= 500);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancel_reason" CHECK (char_length(btrim("orders"."cancel_reason")) between 1 and 500);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_decline_reason" CHECK (char_length(btrim("orders"."decline_reason")) between 1 and 500);