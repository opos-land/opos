ALTER TABLE "orders" DROP CONSTRAINT "orders_holder_name";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_holder_name" CHECK (char_length("orders"."holder_name") <= 200);