CREATE TYPE "public"."name_order" AS ENUM('nickname-middle', 'nickname-last');--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "name_order" "name_order" DEFAULT 'nickname-middle' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_nickname_length" CHECK (char_length("accounts"."nickname") between 1 and 50);